// Centralized API configuration for MyHWManager Server Frontend.
// In development, falls back to localhost. In production, set VITE_API_URL env.

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
