# Control Instrument Web Interface
# 控制儀器網頁介面

## 🧭 Project Overview | 專案簡介
This repository hosts a **Next.js (App Router)** application for operating laboratory instruments, synchronizing live state, and performing hardware RPC calls.
本專案是一個基於 **Next.js (App Router)** 的實驗室儀器控制與資料管理介面，提供即時互動、狀態同步與硬體 RPC 呼叫功能。

Supported instruments | 支援的儀器：
- **Wavemeter (HighFinesse, Lightwave Link)**
- **DAQ USB3104 Analog**
- **SpinCore Pulse Generator**
- **Generic JSON state viewer**

---

## 🏗️ Architecture | 專案架構
```
app/
 ├─ admin/                 # Admin console (title editing, endpoint settings)
 ├─ wavemeter/[id]/        # Wavemeter control & monitoring
 ├─ usb3104-analog/[id]/   # DAQ USB3104 Analog controller
 ├─ spincore/[id]/         # SpinCore pulse sequencer UI
 ├─ instruments/[id]/      # Generic JSON viewer
 └─ api/                   # Backend API (state, mutate, undo/redo, endpoints, RPC)
lib/
 ├─ rpc.ts                 # RPC definitions
 ├─ rpc-client.ts          # Frontend RPC client
 ├─ rpc-server.ts          # Backend RPC handler
 ├─ pageEvents.ts          # SSE (Server-Sent Events) broadcaster
 ├─ dataStore.ts           # Page data storage & state manager
 ├─ pageHistory.ts         # Undo/Redo history manager
 ├─ endpoints-store.ts     # Instrument endpoint configuration
 └─ types.ts               # Shared type definitions
```

Key characteristics | 核心特點：
- **Frontend**: Next.js 13+, React Hooks, TailwindCSS
- **State sync**: Real-time updates via `/api/page/[id]/events` (SSE)
- **History**: Built-in **Undo / Redo** per page
- **RPC**: Dedicated APIs per instrument (e.g. `/api/usb3104-analog/set`) and shared mutate endpoints
- **前端框架**：Next.js 13+、React Hooks、TailwindCSS
- **狀態同步**：透過 `/api/page/[id]/events` 使用 **SSE** 即時更新
- **操作歷史**：每個頁面支援 **Undo / Redo**
- **RPC**：各儀器專屬 API（如 `/api/usb3104-analog/set`）與共享狀態更新端點

---

## 📑 Page Features | 頁面功能
### 1. Admin Page (`/admin`)
- Edit titles for any page (`/api/page/[id]/meta`)
- Configure instrument endpoints and names
- Manage connections for new or existing devices
- 修改任意頁面的標題（`/api/page/[id]/meta`）
- 設定儀器 Endpoint 與名稱
- 便於新增、維護或更新儀器連線資訊

### 2. Wavemeter Page (`/wavemeter/[id]`)
- Monitor **HighFinesse Wavemeter** status
- Features: Run/Stop, Calibrate, repetition timing, channel labels, channel enable toggles, sensor timing adjustments
- Undo/Redo support with instant table refresh
- 監控 **HighFinesse Wavemeter** 狀態
- 功能：Run/Stop、Calibrate、重複時間設定、Channel 標籤、Channel 啟用切換、Sensor 值調整
- 支援 Undo/Redo，表格即時更新

### 3. USB3104 Analog Page (`/usb3104-analog/[id]`)
- Control **Mcculw USB3104 DAQ** analog outputs (-10V ~ +10V, 0.001V precision)
- Keyboard smart-step adjustments, editable channel comments, debounced RPC dispatch (~120ms)
- Undo/Redo enabled for every change
- 控制 **Mcculw USB3104 DAQ** 類比輸出（-10V ~ +10V，精度 0.001V）
- 支援鍵盤智慧步進、Channel 備註編輯、約 120ms 的 RPC 送出節流
- 每個變更皆支援 Undo/Redo

### 4. SpinCore Page (`/spincore/[id]`)
- Manage **SpinCore Pulse Programmer** sequences and timings
- Sequence CRUD, import/export, drag-reorder, timing range, units, instruction types, loop counts, 24-bit channel mask editing, channel naming, and run trigger
- Undo/Redo and panel collapsing for focused editing
- 控制 **SpinCore Pulse Programmer** 序列與時間設定
- 提供序列新增/刪除/移動/複製/匯入、Timing 範圍與單位切換、指令類型與迴圈次數、24-bit Channel 控制、Channel 命名與執行指令
- 支援 Undo/Redo 與面板收合，方便專注編輯

### 5. Instruments Generic Viewer (`/instruments/[id]`)
- Fallback JSON viewer for unsupported instruments
- Automatic routing by instrument ID (0→admin, 1→wavemeter, 2→usb3104, 3→spincore, else → raw JSON)
- Useful during early development of new hardware integrations
- 一般 JSON 檢視頁面
- 依照儀器 ID 自動導向（0→admin、1→wavemeter、2→usb3104、3→spincore，其餘顯示 JSON）
- 適合在新儀器尚未有專屬 UI 時檢視資料

---

## 🔄 Data Flow | 資料流與操作
1. **Initial load**: Fetch `/api/page/[id]/meta` and `/api/page/[id]/state`
2. **Mutations**: Client actions call `POST /api/page/[id]/mutate`; conflicts (`409`) trigger a fresh state fetch
3. **Realtime sync**: Server pushes `/api/page/[id]/events` via SSE, and the frontend reconciles by version
4. **Undo/Redo**: `/api/page/[id]/undo` and `/redo` handled by `pageHistory.ts`
1. **首次載入**：請求 `/api/page/[id]/meta` 與 `/api/page/[id]/state`
2. **狀態更新**：使用者操作觸發 `POST /api/page/[id]/mutate`，若回傳 `409` 會重新抓取最新狀態
3. **即時同步**：伺服器透過 `/api/page/[id]/events` (SSE) 推播更新，前端依版本比對與整合
4. **Undo/Redo**：呼叫 `/api/page/[id]/undo` 或 `/redo`，由 `pageHistory.ts` 管理

---

## 🚀 Getting Started | 安裝與啟動
### Requirements | 系統需求
- Node.js 18+
- npm or yarn
- Node.js 18+
- npm 或 yarn

### Setup | 安裝步驟
```bash
# Install dependencies | 安裝相依套件
npm install

# Start development server | 啟動開發模式
npm run dev

# Build production bundle | 建立正式版
npm run build

# Run production server | 啟動正式版
npm run start
```
The app runs at `http://localhost:3000` by default.
伺服器預設在 `http://localhost:3000` 運行。

---

## 🧩 Development Notes | 開發注意事項
- Inputs use local drafts to avoid being overwritten by live updates
- RPC calls and mutations are debounced for stability
- Shared types live in `lib/types.ts` for type safety
- New instruments can extend `/instruments/[id]` for routing or provide dedicated pages
- 所有輸入框皆採用「本地草稿」策略，避免被即時事件覆蓋
- RPC 與狀態提交有防抖機制，減少 API 請求壓力
- 共用型別集中於 `lib/types.ts`
- 新增儀器時可在 `/instruments/[id]` 延伸導向或建立專屬頁面

---

## ✅ Summary | 專案總結
This project delivers a **laboratory instrument control platform** combining **React + Next.js UI** with **backend API/RPC** to provide:
- Real-time visualization
- Parameter editing and submission
- Live synchronization with conflict handling
- Undo/Redo history
- Flexible architecture for new instrument integrations
本專案是一個結合 **React + Next.js** 與 **後端 API/RPC** 的儀器控制平台，提供：
- 儀器狀態即時可視化
- 參數設定與送出
- 即時同步與衝突處理
- Undo/Redo 操作記錄
- 易於擴充的新儀器整合架構
