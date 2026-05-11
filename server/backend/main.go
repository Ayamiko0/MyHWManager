package main

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/ayamiko/myhwmanager/server/models"
)

var db *gorm.DB

// WebSocket Upgrader with origin checking
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow known origins. In production, load from config/env.
		allowedOrigins := []string{
			"http://localhost:5173",  // Vite dev server
			"http://localhost:1420",  // Tauri dev server
			"http://localhost:8080",  // Backend self
			"tauri://localhost",      // Tauri production
			"",                       // No origin (direct WS from desktop app)
		}
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				return true
			}
		}
		log.Printf("WebSocket origin rejected: %s", origin)
		return false
	},
}

// In-memory cache to hold the latest telemetry frame from each device.
var (
	telemetryCache = struct {
		sync.RWMutex
		m map[string]map[string]interface{}
	}{m: make(map[string]map[string]interface{})}

	pinCache = make(map[string]time.Time)
	pinMutex sync.Mutex

	activeClients      = make(map[string]*websocket.Conn)
	activeClientsMutex sync.RWMutex
)

func main() {
	// 0. Load .env configuration
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using defaults")
	}
	initJWTSecret()

	// 1. Initialize Database (SQLite for Prototype)
	var err error
	db, err = gorm.Open(sqlite.Open("myhwmanager.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect to database:", err)
	}

	// Auto Migrate Tables
	db.AutoMigrate(
		&models.Device{},
		&models.DeviceGroup{},
		&models.ActivityLog{},
		&models.AppSettings{},
		&models.AdminUser{},
		&models.FileNode{},
		&models.FileShare{},
	)

	// Seed Settings if not exists
	var settings models.AppSettings
	if result := db.First(&settings, 1); result.Error != nil {
		db.Create(&models.AppSettings{ID: 1, LogRetentionPeriod: "1w"})
	}

	// Seed default admin user
	seedAdminUser()

	log.Println("Database initialization complete.")

	// Start background Log Cleaner Goroutine
	go logCleanupWorker()

	// 2. Setup Gin Router
	r := gin.Default()

	// CORS — Use AllowOriginFunc for flexible origin matching (supports tauri:// scheme)
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			allowed := []string{
				"http://localhost:5173",  // Vite dev server
				"http://localhost:1420",  // Tauri dev server
				"http://localhost:8080",  // Backend self
				"tauri://localhost",      // Tauri production
			}
			for _, a := range allowed {
				if origin == a {
					return true
				}
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Agent-Token", "X-Device-ID"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// --- Public API Routes (no auth required) ---
	api := r.Group("/api")
	{
		// Auth
		api.POST("/auth/login", loginHandler)

		// Pairing — secured by PIN, not JWT
		api.POST("/pair", pairDevice)

		// Read-only device data (for paired clients polling their own status)
		api.GET("/devices", getDevices)
		api.GET("/devices/:id/telemetry", getDeviceTelemetry)
	}

	// --- Protected Admin API Routes (JWT required) ---
	admin := r.Group("/api")
	admin.Use(authRequired())
	{
		// Device management
		admin.DELETE("/devices/:id", deleteDevice)
		admin.PUT("/devices/:id/group", assignDeviceGroup)
		admin.POST("/remote/request/:id", requestRemoteSession)
		admin.POST("/remote/terminal/:id", requestTerminalSession)

		// Groups
		admin.GET("/groups", getGroups)
		admin.POST("/groups", createGroup)
		admin.DELETE("/groups/:id", deleteGroup)

		// Logs & Settings
		admin.GET("/logs", getLogs)
		admin.GET("/settings", getSettings)
		admin.PUT("/settings", updateSettings)

		// Admin PIN Generation
		admin.POST("/admin/generate-pin", generatePin)

		// Admin Account Management
		admin.PUT("/admin/change-password", changePassword)

		// Remote File Explorer Relay
		admin.GET("/devices/:id/fs/list", fsListFiles)
		admin.POST("/devices/:id/fs/create_folder", fsCreateFolder)
		admin.POST("/devices/:id/fs/upload", fsUploadFile)
		admin.GET("/devices/:id/fs/download", fsDownloadFile)
		admin.DELETE("/devices/:id/fs/delete", fsDeleteFile)
		admin.PUT("/devices/:id/fs/rename", fsRenameFile)
		admin.PUT("/devices/:id/fs/move", fsMoveFile)
	}

	// --- File Storage API (Shared by Admin and Client) ---
	fileApi := r.Group("/api/files")
	fileApi.Use(clientOrAdminAuth())
	{
		fileApi.GET("/list", listFiles)
		fileApi.POST("/create_folder", createFolder)
		fileApi.POST("/upload", uploadFile)
		fileApi.GET("/download/:id", downloadFile)
		fileApi.DELETE("/:id", deleteFile)
		fileApi.PUT("/rename/:id", renameFile)
		fileApi.PUT("/move/:id", moveFile)
	}

	// --- WebSocket Routes ---
	r.GET("/ws/ingest/:id", wsIngestHandler)
	r.GET("/ws/rtc/signal/:id", rtcSignalWS)
	r.GET("/ws/terminal/signal/:id", terminalSignalWS)

	// 3. Start Server
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("MyHWManager Server starting on :%s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Server run failed:", err)
	}
}

// --- Background Workers ---
func logCleanupWorker() {
	for {
		var settings models.AppSettings
		if err := db.First(&settings, 1).Error; err == nil && settings.LogRetentionPeriod != "never" {
			var duration time.Duration
			switch settings.LogRetentionPeriod {
			case "1h":
				duration = time.Hour
			case "8h":
				duration = 8 * time.Hour
			case "12h":
				duration = 12 * time.Hour
			case "1d":
				duration = 24 * time.Hour
			case "3d":
				duration = 3 * 24 * time.Hour
			case "1w":
				duration = 7 * 24 * time.Hour
			case "1m":
				duration = 30 * 24 * time.Hour
			default:
				duration = 7 * 24 * time.Hour
			}
			cutoff := time.Now().Add(-duration)
			db.Delete(&models.ActivityLog{}, "timestamp < ?", cutoff)
		}
		time.Sleep(1 * time.Hour)
	}
}

// --- API Controllers ---

func generatePin(c *gin.Context) {
	// Enforce max active PINs
	pinMutex.Lock()
	activeCount := 0
	now := time.Now()
	for pin, exp := range pinCache {
		if now.After(exp) {
			delete(pinCache, pin) // clean expired
		} else {
			activeCount++
		}
	}
	if activeCount >= maxActivePins {
		pinMutex.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"error": fmt.Sprintf("Maximum %d active PINs allowed. Wait for existing PINs to expire.", maxActivePins)})
		return
	}

	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	pin := fmt.Sprintf("%06d", n.Int64())
	pinCache[pin] = time.Now().Add(10 * time.Minute)
	pinMutex.Unlock()

	c.JSON(http.StatusOK, gin.H{"pin": pin})
}

func pairDevice(c *gin.Context) {
	clientIP := c.ClientIP()

	// Rate-limit check
	if !checkPinRateLimit(clientIP) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many failed attempts. Try again later."})
		return
	}

	var req struct {
		ClientID     string `json:"client_id"`
		Pin          string `json:"pin"`
		Name         string `json:"name"`
		OS           string `json:"os"`
		CPUName      string `json:"cpu_name"`
		RAMTotal     uint64 `json:"ram_total"`
		HardwareData string `json:"hardware_data"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid pairing payload"})
		return
	}

	// Validate PIN
	pinMutex.Lock()
	expireTime, exists := pinCache[req.Pin]
	if !exists || time.Now().After(expireTime) {
		if exists {
			delete(pinCache, req.Pin)
		}
		pinMutex.Unlock()
		recordPinFailure(clientIP)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired PIN"})
		return
	}
	// Valid PIN, consume it
	delete(pinCache, req.Pin)
	pinMutex.Unlock()

	// Clear rate limit on success
	clearPinRateLimit(clientIP)

	// Generate agent token for this device
	agentToken := generateAgentToken(req.ClientID)

	device := models.Device{
		ID:           req.ClientID,
		Name:         req.Name,
		OS:           req.OS,
		CPUName:      req.CPUName,
		RAMTotal:     req.RAMTotal,
		HardwareData: req.HardwareData,
		AgentToken:   agentToken,
		Status:       "offline",
		LastSeen:     time.Now(),
	}

	if result := db.Save(&device); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to pair device"})
		return
	}

	db.Create(&models.ActivityLog{
		DeviceID:  req.ClientID,
		Event:     "paired",
		Message:   "Device was securely paired via PIN",
		Timestamp: time.Now(),
	})

	log.Printf("Device paired successfully: %s (%s)", req.Name, req.ClientID)
	c.JSON(http.StatusOK, gin.H{
		"status":      "success",
		"agent_token": agentToken,
	})
}

func getDevices(c *gin.Context) {
	var devices []models.Device
	db.Find(&devices)
	c.JSON(http.StatusOK, devices)
}

func getDeviceTelemetry(c *gin.Context) {
	id := c.Param("id")

	telemetryCache.RLock()
	data, exists := telemetryCache.m[id]
	telemetryCache.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No telemetry found or device is offline"})
		return
	}
	c.JSON(http.StatusOK, data)
}

// --- WebSocket Handlers ---

func wsIngestHandler(c *gin.Context) {
	id := c.Param("id")
	token := c.Query("token")

	// Verify agent token before upgrading
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Agent token required. Use ?token=xxx"})
		return
	}

	// Verify the token matches the device
	var device models.Device
	if err := db.Where("id = ?", id).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	if !verifyAgentToken(id, token) {
		log.Printf("WebSocket auth failed for device %s — invalid agent token", id)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid agent token"})
		return
	}

	// Upgrade HTTP to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Failed to upgrade WebSocket:", err)
		return
	}
	
	activeClientsMutex.Lock()
	activeClients[id] = conn
	activeClientsMutex.Unlock()

	defer func() {
		activeClientsMutex.Lock()
		delete(activeClients, id)
		activeClientsMutex.Unlock()
		conn.Close()
	}()

	// Mark device as online in DB
	db.Model(&models.Device{}).Where("id = ?", id).Update("status", "online")
	db.Create(&models.ActivityLog{
		DeviceID:  id,
		Event:     "connected",
		Message:   "WebSocket telemetry stream established",
		Timestamp: time.Now(),
	})
	log.Printf("Device %s Connected via WebSocket\n", id)

	for {
		var data map[string]interface{}
		err := conn.ReadJSON(&data)
		if err != nil {
			log.Printf("Device %s Disconnected: %v\n", id, err)
			break
		}

		if typeStr, ok := data["type"].(string); ok && typeStr == "fs_response" {
			handleFSResponse(data)
			continue
		}

		data["device_id"] = id

		telemetryCache.Lock()
		telemetryCache.m[id] = data
		telemetryCache.Unlock()

		db.Model(&models.Device{}).Where("id = ?", id).UpdateColumns(map[string]interface{}{
			"last_seen": time.Now(),
			"status":    "online",
		})
	}

	// Connection loop broken, mark offline
	db.Model(&models.Device{}).Where("id = ?", id).Update("status", "offline")
	db.Create(&models.ActivityLog{
		DeviceID:  id,
		Event:     "disconnected",
		Message:   "WebSocket telemetry stream lost",
		Timestamp: time.Now(),
	})

	telemetryCache.Lock()
	delete(telemetryCache.m, id)
	telemetryCache.Unlock()
}
