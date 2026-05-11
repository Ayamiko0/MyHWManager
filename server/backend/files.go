package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/ayamiko/myhwmanager/server/models"
	"github.com/gin-gonic/gin"
)

const storageDir = "./storage/files"

func init() {
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		fmt.Printf("Warning: failed to create storage directory: %v\n", err)
	}
}

// clientOrAdminAuth is a middleware that checks if the request is from an Admin (JWT)
// or from a valid Client (X-Agent-Token). It sets "is_admin" and "device_id" in the context.
func clientOrAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check for Admin JWT
		cookie, err := c.Cookie("admin_token")
		if err == nil {
			if _, err := validateJWT(cookie); err == nil {
				c.Set("is_admin", true)
				c.Next()
				return
			}
		}
		
		// Fallback to Bearer token for Admin
		authHeader := c.GetHeader("Authorization")
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			if _, err := validateJWT(authHeader[7:]); err == nil {
				c.Set("is_admin", true)
				c.Next()
				return
			}
		}

		// Check for Client Agent Token
		agentToken := c.GetHeader("X-Agent-Token")
		deviceID := c.GetHeader("X-Device-ID")
		
		if agentToken != "" && deviceID != "" {
			var device models.Device
			if result := db.Where("id = ? AND agent_token = ?", deviceID, agentToken).First(&device); result.Error == nil {
				c.Set("is_admin", false)
				c.Set("device_id", deviceID)
				c.Next()
				return
			}
		}

		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		c.Abort()
	}
}

func listFiles(c *gin.Context) {
	targetDeviceID := c.Query("device_id")
	parentIDStr := c.Query("parent_id")

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && targetDeviceID != requestingDeviceID && targetDeviceID != "HUB" {
		// Check if requesting device has shared access to the target folder?
		// For simplicity right now, only admins or the owner can list a device's root folder.
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	var files []models.FileNode
	query := db.Where("owner_device_id = ?", targetDeviceID)
	
	if parentIDStr == "" || parentIDStr == "null" {
		query = query.Where("parent_id IS NULL")
	} else {
		query = query.Where("parent_id = ?", parentIDStr)
	}

	query.Find(&files)
	c.JSON(http.StatusOK, files)
}

func createFolder(c *gin.Context) {
	var req struct {
		OwnerDeviceID string `json:"owner_device_id"`
		ParentID      *uint  `json:"parent_id"`
		Name          string `json:"name"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && req.OwnerDeviceID != requestingDeviceID && req.OwnerDeviceID != "HUB" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	folder := models.FileNode{
		OwnerDeviceID: req.OwnerDeviceID,
		ParentID:      req.ParentID,
		Name:          req.Name,
		IsDir:         true,
	}

	if err := db.Create(&folder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func uploadFile(c *gin.Context) {
	ownerDeviceID := c.PostForm("owner_device_id")
	parentIDStr := c.PostForm("parent_id")
	
	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && ownerDeviceID != requestingDeviceID && ownerDeviceID != "HUB" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Parse parent ID
	var parentID *uint
	if parentIDStr != "" && parentIDStr != "null" {
		if pid, err := strconv.ParseUint(parentIDStr, 10, 32); err == nil {
			p := uint(pid)
			parentID = &p
		}
	}

	// Create physical file
	fileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), header.Filename)
	filePath := filepath.Join(storageDir, fileName)
	
	out, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write file"})
		return
	}

	// Create DB record
	fileNode := models.FileNode{
		OwnerDeviceID: ownerDeviceID,
		ParentID:      parentID,
		Name:          header.Filename,
		IsDir:         false,
		Size:          header.Size,
		MimeType:      header.Header.Get("Content-Type"),
		StoragePath:   filePath,
	}

	if err := db.Create(&fileNode).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file metadata"})
		return
	}

	c.JSON(http.StatusOK, fileNode)
}

func downloadFile(c *gin.Context) {
	fileID := c.Param("id")

	var fileNode models.FileNode
	if err := db.First(&fileNode, fileID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && fileNode.OwnerDeviceID != requestingDeviceID && fileNode.OwnerDeviceID != "HUB" {
		// Check if it's shared
		var share models.FileShare
		if err := db.Where("file_node_id = ? AND target_device_id = ?", fileNode.ID, requestingDeviceID).First(&share).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
			return
		}
	}

	c.FileAttachment(fileNode.StoragePath, fileNode.Name)
}

func deleteFile(c *gin.Context) {
	fileID := c.Param("id")

	var fileNode models.FileNode
	if err := db.First(&fileNode, fileID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && fileNode.OwnerDeviceID != requestingDeviceID && fileNode.OwnerDeviceID != "HUB" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	// Delete from DB
	db.Delete(&fileNode)

	// Delete from disk if not a folder
	if !fileNode.IsDir && fileNode.StoragePath != "" {
		os.Remove(fileNode.StoragePath)
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func renameFile(c *gin.Context) {
	fileID := c.Param("id")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var fileNode models.FileNode
	if err := db.First(&fileNode, fileID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && fileNode.OwnerDeviceID != requestingDeviceID && fileNode.OwnerDeviceID != "HUB" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	fileNode.Name = req.Name
	db.Save(&fileNode)

	c.JSON(http.StatusOK, fileNode)
}

func moveFile(c *gin.Context) {
	fileID := c.Param("id")
	var req struct {
		ParentID *uint `json:"parent_id"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var fileNode models.FileNode
	if err := db.First(&fileNode, fileID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	isAdmin := c.GetBool("is_admin")
	requestingDeviceID := c.GetString("device_id")

	if !isAdmin && fileNode.OwnerDeviceID != requestingDeviceID && fileNode.OwnerDeviceID != "HUB" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	fileNode.ParentID = req.ParentID
	db.Save(&fileNode)

	c.JSON(http.StatusOK, fileNode)
}
