package models

import "time"

type AdminUser struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"uniqueIndex" json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type DeviceGroup struct {
	ID          uint     `gorm:"primaryKey" json:"id"`
	Name        string   `json:"name"`
	Permissions string   `json:"permissions"` // e.g. "read_only", "full_access"
	Devices     []Device `gorm:"foreignKey:GroupID" json:"-"`
}

type Device struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	GroupID      *uint     `json:"group_id"`
	Name         string    `json:"name"`
	OS           string    `json:"os"`
	CPUName      string    `json:"cpu_name"`
	RAMTotal     uint64    `json:"ram_total"`
	HardwareData string    `json:"hardware_data"`
	AgentToken   string    `json:"-"` // HMAC-signed token for WebSocket auth
	Status       string    `json:"status"`
	LastSeen     time.Time `json:"last_seen"`
}

type ActivityLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  string    `json:"device_id"`
	Event     string    `json:"event"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

type AppSettings struct {
	ID                 uint   `gorm:"primaryKey" json:"id"`
	LogRetentionPeriod string `json:"log_retention_period"`
}

type FileNode struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	OwnerDeviceID string    `gorm:"index" json:"owner_device_id"`
	ParentID      *uint     `gorm:"index" json:"parent_id"` // null for root
	Name          string    `json:"name"`
	IsDir         bool      `json:"is_dir"`
	Size          int64     `json:"size"`
	MimeType      string    `json:"mime_type"`
	StoragePath   string    `json:"-"` // Path on actual server disk
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type FileShare struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	FileNodeID     uint      `gorm:"index" json:"file_node_id"`
	TargetDeviceID string    `gorm:"index" json:"target_device_id"` // who is it shared with
	Permission     string    `json:"permission"` // "read", "write"
	CreatedAt      time.Time `json:"created_at"`
}
