package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	fsRequestsMutex sync.RWMutex
	fsRequests      = make(map[string]chan map[string]interface{})
)

// Send request to client and wait for response
func relayFSRequest(deviceID string, reqData map[string]interface{}) (map[string]interface{}, error) {
	activeClientsMutex.RLock()
	conn, exists := activeClients[deviceID]
	activeClientsMutex.RUnlock()

	if !exists || conn == nil {
		return nil, fmt.Errorf("device is offline")
	}

	reqID := generateID()
	reqData["request_id"] = reqID
	reqData["type"] = "fs_request"

	ch := make(chan map[string]interface{}, 1)
	
	fsRequestsMutex.Lock()
	fsRequests[reqID] = ch
	fsRequestsMutex.Unlock()

	defer func() {
		fsRequestsMutex.Lock()
		delete(fsRequests, reqID)
		fsRequestsMutex.Unlock()
	}()

	err := conn.WriteJSON(reqData)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to device: %v", err)
	}

	select {
	case res := <-ch:
		if errStr, ok := res["error"].(string); ok && errStr != "" {
			return nil, fmt.Errorf("%s", errStr)
		}
		return res, nil
	case <-time.After(10 * time.Second):
		return nil, fmt.Errorf("request timed out")
	}
}

// Handlers

func fsListFiles(c *gin.Context) {
	deviceID := c.Param("id")
	path := c.Query("path")
	if path == "" {
		path = "/" // Default root
	}

	res, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "list",
		"path":   path,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Assuming client sends back data in `data` field
	c.JSON(http.StatusOK, res["data"])
}

func fsCreateFolder(c *gin.Context) {
	deviceID := c.Param("id")
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	_, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "create_folder",
		"path":   req.Path,
		"name":   req.Name,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func fsDeleteFile(c *gin.Context) {
	deviceID := c.Param("id")
	var req struct {
		Path string `json:"path"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	_, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "delete",
		"path":   req.Path,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleFSResponse(data map[string]interface{}) {
	reqID, ok := data["request_id"].(string)
	if !ok {
		return
	}

	fsRequestsMutex.RLock()
	ch, exists := fsRequests[reqID]
	fsRequestsMutex.RUnlock()

	if exists {
		ch <- data
	}
}

// For upload/download, we will need to handle binary data. 
// However, since WebSocket JSON `WriteJSON` is string only, 
// we might need to base64 encode/decode, or use the separate binary WS like terminal.
// For MVP, we can rely on Base64 encoding over JSON for small files, or defer it.
// To fully support big file uploads over WS, we would need to parse binary frames and correlate them, 
// but for now, we'll support basic folder browsing.

// Let's implement an endpoint that can handle Base64 upload
func fsUploadFile(c *gin.Context) {
	deviceID := c.Param("id")
	
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()
	
	path := c.PostForm("path")

	// Read file into memory (Warning: not suitable for very large files, but ok for MVP)
	// For production, we'd chunk this or use a dedicated WebRTC data channel.
	bytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	b64Data := base64.StdEncoding.EncodeToString(bytes)

	_, err = relayFSRequest(deviceID, map[string]interface{}{
		"action":   "upload",
		"path":     path,
		"filename": header.Filename,
		"data":     b64Data,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Download file via Base64
func fsDownloadFile(c *gin.Context) {
	deviceID := c.Param("id")
	path := c.Query("path")

	res, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "download",
		"path":   path,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	b64Data, ok := res["data"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid data received"})
		return
	}

	bytes, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode data"})
		return
	}

	c.Data(http.StatusOK, "application/octet-stream", bytes)
}

func fsRenameFile(c *gin.Context) {
	deviceID := c.Param("id")
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"` // new name
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	_, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "rename",
		"path":   req.Path,
		"name":   req.Name,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func fsMoveFile(c *gin.Context) {
	deviceID := c.Param("id")
	var req struct {
		Path string `json:"path"`
		Name string `json:"name"` // new path
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	_, err := relayFSRequest(deviceID, map[string]interface{}{
		"action": "move",
		"path":   req.Path,
		"name":   req.Name,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
