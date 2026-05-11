#!/bin/bash

# Hiển thị màu sắc cho đẹp mắt
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Đang khởi động hệ thống MyHWManager Server...${NC}"

# Dọn dẹp tiến trình cũ bị treo (nếu có)
echo "Dọn dẹp tiến trình cũ..."
fuser -k 8080/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null
pkill -f "myhwmanager_backend" 2>/dev/null
sleep 1

# 1. Build và khởi động Go Backend
echo -e "${BLUE}▶ Đang build Go Backend (Cổng 8080)...${NC}"
cd backend
go build -o myhwmanager_backend .
./myhwmanager_backend &
BACKEND_PID=$!

# Quay lại thư mục gốc của server
cd ..

# 2. Khởi động React Frontend
echo -e "${BLUE}▶ Đang khởi động React Frontend (Cổng 5173)...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Cài đặt dependencies lần đầu..."
    npm install
fi
npm run dev &
FRONTEND_PID=$!

# Xử lý tắt an toàn khi nhấn Ctrl+C
cleanup() {
    echo -e "\n${BLUE}Đang tắt MyHWManager Server...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    pkill -P $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "\n${GREEN}✅ Tất cả dịch vụ đã sẵn sàng!${NC}"
echo -e "Frontend: http://localhost:5173"
echo -e "Backend:  http://localhost:8080"
echo -e "Nhấn Ctrl+C để tắt toàn bộ."

wait
