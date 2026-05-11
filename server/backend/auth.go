package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/ayamiko/myhwmanager/server/models"
)

// JWT Secret — generated randomly on every startup to invalidate old admin sessions.
var jwtSecret []byte

// Agent Secret - loaded from .env (JWT_SECRET) to keep device pairings persistent across restarts.
var agentSecret []byte

func initJWTSecret() {
	// Generate random 32-byte secret for JWT
	b := make([]byte, 32)
	rand.Read(b)
	jwtSecret = b

	// Load persistent secret for Agent Tokens
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "myhwmanager-default-secret"
	}
	agentSecret = []byte(secret)
}

// --- Password Utilities ---

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func verifyPassword(hashedPassword, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err == nil
}

// --- JWT Utilities ---

func generateJWT(username string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(24 * time.Hour).Unix(), // 24-hour expiry
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func validateJWT(tokenString string) (*jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &claims, nil
	}
	return nil, jwt.ErrSignatureInvalid
}

// --- Agent Token Utilities ---
// Agent tokens are HMAC-SHA256 signed strings tied to a device ID.
// They are generated once during pairing and used for WebSocket auth.

func generateAgentToken(deviceID string) string {
	h := hmac.New(sha256.New, agentSecret)
	h.Write([]byte(deviceID))
	return hex.EncodeToString(h.Sum(nil))
}

func verifyAgentToken(deviceID, token string) bool {
	expected := generateAgentToken(deviceID)
	return hmac.Equal([]byte(expected), []byte(token))
}

// --- Gin Middleware ---

// authRequired is a middleware that protects admin-only API routes.
// It expects a Bearer token in the Authorization header.
func authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Expect format: "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format. Use: Bearer <token>"})
			c.Abort()
			return
		}

		claims, err := validateJWT(parts[1])
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Attach username to context for downstream handlers
		if sub, ok := (*claims)["sub"].(string); ok {
			c.Set("username", sub)
		}
		c.Next()
	}
}

// --- Auth API Handlers ---

func loginHandler(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid login payload"})
		return
	}

	var admin models.AdminUser
	if err := db.Where("username = ?", req.Username).First(&admin).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	if !verifyPassword(admin.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	token, err := generateJWT(admin.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    token,
		"username": admin.Username,
	})
}

// seedAdminUser creates or updates the admin account from .env credentials.
// On every startup, it syncs the admin user with ADMIN_USERNAME and ADMIN_PASSWORD from .env.
func seedAdminUser() {
	username := os.Getenv("ADMIN_USERNAME")
	password := os.Getenv("ADMIN_PASSWORD")
	if username == "" {
		username = "admin"
	}
	if password == "" {
		password = "admin"
	}

	hash, _ := hashPassword(password)

	var admin models.AdminUser
	if err := db.Where("username = ?", username).First(&admin).Error; err != nil {
		// Admin doesn't exist, create it
		db.Create(&models.AdminUser{
			Username:     username,
			PasswordHash: hash,
		})
		log.Printf("Admin user created from .env: %s", username)
	} else {
		// Admin exists, update password to match .env
		db.Model(&admin).Update("password_hash", hash)
		log.Printf("Admin user synced from .env: %s", username)
	}
}

// --- PIN Rate Limiting ---

// rateLimitStore tracks failed PIN attempts per IP address.
type rateLimitEntry struct {
	Attempts  int
	LockedAt  time.Time
	FirstFail time.Time
}

var rateLimitMutex = &pinMutex // reuse existing mutex for simplicity
var rateLimitStore = make(map[string]*rateLimitEntry)

const maxPinAttempts = 5
const pinLockoutDuration = 30 * time.Minute
const pinAttemptWindow = 10 * time.Minute
const maxActivePins = 3

// checkPinRateLimit returns true if the IP is allowed to attempt PIN validation.
func checkPinRateLimit(ip string) bool {
	rateLimitMutex.Lock()
	defer rateLimitMutex.Unlock()

	entry, exists := rateLimitStore[ip]
	if !exists {
		return true
	}

	// Check if lockout has expired
	if !entry.LockedAt.IsZero() && time.Now().Before(entry.LockedAt.Add(pinLockoutDuration)) {
		return false // still locked out
	}

	// Reset if window has expired
	if time.Now().After(entry.FirstFail.Add(pinAttemptWindow)) {
		delete(rateLimitStore, ip)
		return true
	}

	return entry.Attempts < maxPinAttempts
}

// recordPinFailure records a failed PIN attempt for the given IP.
func recordPinFailure(ip string) {
	rateLimitMutex.Lock()
	defer rateLimitMutex.Unlock()

	entry, exists := rateLimitStore[ip]
	if !exists {
		rateLimitStore[ip] = &rateLimitEntry{
			Attempts:  1,
			FirstFail: time.Now(),
		}
		return
	}

	entry.Attempts++
	if entry.Attempts >= maxPinAttempts {
		entry.LockedAt = time.Now()
		log.Printf("IP %s locked out after %d failed PIN attempts", ip, entry.Attempts)
	}
}

// clearPinRateLimit clears the rate limit for an IP after successful pairing.
func clearPinRateLimit(ip string) {
	rateLimitMutex.Lock()
	defer rateLimitMutex.Unlock()
	delete(rateLimitStore, ip)
}
