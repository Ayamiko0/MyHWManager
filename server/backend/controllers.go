package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
    "github.com/ayamiko/myhwmanager/server/models"
)

// --- Groups API ---

func getGroups(c *gin.Context) {
    var groups []models.DeviceGroup
    db.Find(&groups)
    c.JSON(http.StatusOK, groups)
}

func createGroup(c *gin.Context) {
    var group models.DeviceGroup
    if err := c.BindJSON(&group); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
        return
    }
    if group.Permissions == "" {
        group.Permissions = "read_only" // Default
    }
    if result := db.Create(&group); result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group"})
        return
    }
    c.JSON(http.StatusOK, group)
}

func deleteGroup(c *gin.Context) {
    id := c.Param("id")
    // Remove devices from this group before deleting
    db.Model(&models.Device{}).Where("group_id = ?", id).Update("group_id", nil)
    db.Delete(&models.DeviceGroup{}, id)
    c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func assignDeviceGroup(c *gin.Context) {
    deviceID := c.Param("id")
    var req struct {
        GroupID *uint `json:"group_id"`
    }
    if err := c.BindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
        return
    }
    db.Model(&models.Device{}).Where("id = ?", deviceID).Update("group_id", req.GroupID)
    c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// --- Devices API (Additions) ---

func deleteDevice(c *gin.Context) {
    deviceID := c.Param("id")
    db.Delete(&models.Device{}, "id = ?", deviceID)
    db.Delete(&models.ActivityLog{}, "device_id = ?", deviceID)
    c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// --- Activity Logs API ---

func getLogs(c *gin.Context) {
    var logs []models.ActivityLog
    // Fetch last 50 logs ordered by timestamp descending
    db.Order("timestamp desc").Limit(50).Find(&logs)
    c.JSON(http.StatusOK, logs)
}

// --- Settings API ---

func getSettings(c *gin.Context) {
    var settings models.AppSettings
    db.First(&settings, 1) // Always ID 1
    c.JSON(http.StatusOK, settings)
}

func updateSettings(c *gin.Context) {
    var req models.AppSettings
    if err := c.BindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
        return
    }
    db.Model(&models.AppSettings{}).Where("id = 1").Update("log_retention_period", req.LogRetentionPeriod)
    c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// --- Admin Account API ---

func changePassword(c *gin.Context) {
    username, _ := c.Get("username")
    var req struct {
        CurrentPassword string `json:"current_password"`
        NewPassword     string `json:"new_password"`
    }
    if err := c.BindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
        return
    }
    if len(req.NewPassword) < 6 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
        return
    }

    var admin models.AdminUser
    if err := db.Where("username = ?", username).First(&admin).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }
    if !verifyPassword(admin.PasswordHash, req.CurrentPassword) {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
        return
    }

    newHash, _ := hashPassword(req.NewPassword)
    db.Model(&admin).Update("password_hash", newHash)
    c.JSON(http.StatusOK, gin.H{"status": "Password changed successfully"})
}

