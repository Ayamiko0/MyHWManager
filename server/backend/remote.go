package main

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ─── Session ────────────────────────────────────────────────────────────────

type RtcSession struct {
	SessionID string
	DeviceID  string
	CreatedAt time.Time

	mu     sync.Mutex
	client *websocket.Conn // Tauri app (offerer)
	viewer *websocket.Conn // Admin dashboard (answerer)

	clientReady chan struct{}
	viewerReady chan struct{}
}

type TerminalSession struct {
	SessionID string
	DeviceID  string
	CreatedAt time.Time

	mu     sync.Mutex
	client *websocket.Conn // Tauri app (PTY host)
	viewer *websocket.Conn // Admin dashboard (xterm.js)

	clientReady chan struct{}
	viewerReady chan struct{}
}

var (
	rtcSessions      = make(map[string]*RtcSession)
	rtcSessionsMutex sync.RWMutex

	terminalSessions      = make(map[string]*TerminalSession)
	terminalSessionsMutex sync.RWMutex
)

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ─── Request Remote Session (Admin API) ─────────────────────────────────────

func requestRemoteSession(c *gin.Context) {
	deviceID := c.Param("id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing device ID"})
		return
	}

	sessionID := generateID() + generateID() // 32 hex chars

	session := &RtcSession{
		SessionID:   sessionID,
		DeviceID:    deviceID,
		CreatedAt:   time.Now(),
		clientReady: make(chan struct{}, 1),
		viewerReady: make(chan struct{}, 1),
	}

	rtcSessionsMutex.Lock()
	rtcSessions[sessionID] = session
	rtcSessionsMutex.Unlock()

	// Schedule session cleanup after 5 minutes if unused
	go func() {
		time.Sleep(5 * time.Minute)
		rtcSessionsMutex.Lock()
		delete(rtcSessions, sessionID)
		rtcSessionsMutex.Unlock()
	}()

	// Notify client via telemetry WebSocket — no password needed,
	// the signaling WebSocket itself is authenticated by session ID.
	activeClientsMutex.RLock()
	clientConn, ok := activeClients[deviceID]
	activeClientsMutex.RUnlock()

	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Device is offline or not connected"})
		return
	}

	msg := map[string]interface{}{
		"type":       "remote_request",
		"session_id": sessionID,
	}
	if err := clientConn.WriteJSON(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to notify device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"session_id": sessionID})
}

// ─── WebRTC Signaling WebSocket ──────────────────────────────────────────────

var signalingUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 1024, // 1 MB — MJPEG frames can be large
	WriteBufferSize: 1024 * 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// rtcSignalWS handles both the Client (role=client) and Admin (role=viewer)
// connecting to the same session. It simply pipes JSON messages between the
// two parties — SDP offers/answers and ICE candidates.
//
//	?role=client  — Tauri WebView (offerer)
//	?role=viewer  — Admin Dashboard (answerer)
func rtcSignalWS(c *gin.Context) {
	sessionID := c.Param("id")
	role := c.Query("role") // "client" or "viewer"

	rtcSessionsMutex.RLock()
	session, exists := rtcSessions[sessionID]
	rtcSessionsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or expired"})
		return
	}

	conn, err := signalingUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("rtcSignalWS upgrade error: %v", err)
		return
	}

	session.mu.Lock()
	if role == "client" {
		if session.client != nil {
			session.client.Close()
		}
		session.client = conn
		select {
		case session.clientReady <- struct{}{}:
		default:
		}
	} else {
		if session.viewer != nil {
			session.viewer.Close()
		}
		session.viewer = conn
		select {
		case session.viewerReady <- struct{}{}:
		default:
		}
	}
	session.mu.Unlock()

	// Wait for both sides to be present, then start relaying
	go relaySignaling(session, role, conn)
}

// relaySignaling reads JSON messages from `conn` and forwards them to the
// other side. It blocks until the connection closes or an error occurs.
func relaySignaling(session *RtcSession, myRole string, conn *websocket.Conn) {
	defer func() {
		conn.Close()
		// Clean up session when either side disconnects
		rtcSessionsMutex.Lock()
		delete(rtcSessions, session.SessionID)
		rtcSessionsMutex.Unlock()
	}()

	conn.SetReadLimit(2 * 1024 * 1024) // 2 MB max message size

	for {
		messageType, raw, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[rtc-relay] %s read error: %v", myRole, err)
			return
		}

		// Forward to the other party
		session.mu.Lock()
		var peer *websocket.Conn
		if myRole == "client" {
			peer = session.viewer
		} else {
			peer = session.client
		}
		session.mu.Unlock()

		if peer == nil {
			// Other side not connected yet — keep the message for a short while
			// The other side will send its own offer/answer once connected,
			// so we only need to buffer ICE candidates briefly.
			continue
		}

		if err := peer.WriteMessage(messageType, raw); err != nil {
			return
		}
	}
}

// ─── Terminal Signaling WebSocket (Web PTY) ──────────────────────────────────

func requestTerminalSession(c *gin.Context) {
	deviceID := c.Param("id")
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing device ID"})
		return
	}

	sessionID := generateID() + generateID()

	session := &TerminalSession{
		SessionID:   sessionID,
		DeviceID:    deviceID,
		CreatedAt:   time.Now(),
		clientReady: make(chan struct{}, 1),
		viewerReady: make(chan struct{}, 1),
	}

	terminalSessionsMutex.Lock()
	terminalSessions[sessionID] = session
	terminalSessionsMutex.Unlock()

	go func() {
		time.Sleep(5 * time.Minute)
		terminalSessionsMutex.Lock()
		delete(terminalSessions, sessionID)
		terminalSessionsMutex.Unlock()
	}()

	activeClientsMutex.RLock()
	clientConn, ok := activeClients[deviceID]
	activeClientsMutex.RUnlock()

	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Device is offline or not connected"})
		return
	}

	msg := map[string]interface{}{
		"type":       "terminal_request",
		"session_id": sessionID,
	}
	if err := clientConn.WriteJSON(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to notify device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"session_id": sessionID})
}

var terminalUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func terminalSignalWS(c *gin.Context) {
	sessionID := c.Param("id")
	role := c.Query("role")

	terminalSessionsMutex.RLock()
	session, exists := terminalSessions[sessionID]
	terminalSessionsMutex.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or expired"})
		return
	}

	conn, err := terminalUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("terminalSignalWS upgrade error: %v", err)
		return
	}

	session.mu.Lock()
	if role == "client" {
		if session.client != nil {
			session.client.Close()
		}
		session.client = conn
		select {
		case session.clientReady <- struct{}{}:
		default:
		}
	} else {
		if session.viewer != nil {
			session.viewer.Close()
		}
		session.viewer = conn
		select {
		case session.viewerReady <- struct{}{}:
		default:
		}
	}
	session.mu.Unlock()

	go relayTerminal(session, role, conn)
}

func relayTerminal(session *TerminalSession, myRole string, conn *websocket.Conn) {
	defer func() {
		conn.Close()
		terminalSessionsMutex.Lock()
		delete(terminalSessions, session.SessionID)
		terminalSessionsMutex.Unlock()
	}()

	for {
		messageType, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}

		session.mu.Lock()
		var peer *websocket.Conn
		if myRole == "client" {
			peer = session.viewer
		} else {
			peer = session.client
		}
		session.mu.Unlock()

		if peer == nil {
			continue
		}

		if err := peer.WriteMessage(messageType, raw); err != nil {
			return
		}
	}
}
