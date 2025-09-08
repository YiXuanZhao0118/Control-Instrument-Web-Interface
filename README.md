# Control Instrument Web Interface

本專案是一個基於 **Next.js (App Router)** 的實驗室儀器控制與資料管理介面，提供即時互動、狀態同步、與硬體 RPC 呼叫。  
主要支援以下儀器：

- **Wavemeter (HighFinesse, Lightwave Link)**
- **DAQ USB3104 Analog**
- **SpinCore Pulse Generator**
- 以及一般 JSON 狀態檢視頁面

---

## 🔧 專案架構

```
app/
 ├─ admin/                 # 管理頁面 (改標題、設定 Endpoints)
 ├─ wavemeter/[id]/        # Wavemeter 控制與監控
 ├─ usb3104-analog/[id]/   # DAQ USB3104 Analog 控制
 ├─ spincore/[id]/         # SpinCore Pulse Sequencer
 ├─ instruments/[id]/      # 通用 JSON 檢視器
 └─ api/                   # 後端 API (state, mutate, undo/redo, endpoints, RPC)
lib/
 ├─ rpc.ts                 # RPC 呼叫定義
 ├─ rpc-client.ts          # 前端 RPC 客戶端
 ├─ rpc-server.ts          # 後端 RPC 服務端
 ├─ pageEvents.ts          # SSE (Server-Sent Events) 推播
 ├─ dataStore.ts           # 頁面資料儲存與狀態管理
 ├─ pageHistory.ts         # Undo/Redo 歷史紀錄
 ├─ endpoints-store.ts     # 儀器 endpoint 設定
 └─ types.ts               # 共用型別定義
```

- **前端框架**: Next.js 13+ with App Router, React Hooks, TailwindCSS  
- **狀態同步**: 頁面會透過 `/api/page/[id]/events` 使用 **SSE** 即時更新  
- **操作歷史**: 每個頁面支援 **Undo / Redo**  
- **RPC**: 各儀器專屬 API (如 `/api/usb3104-analog/set`) 與狀態同步 API (`/mutate`)  

---

## 📑 頁面功能

### 1. **Admin Page (`/admin`)**
- 修改任意頁面的標題 (透過 `/api/page/[id]/meta`)  
- 管理 **Endpoints**: 設定各儀器的 Base URL 與 instrument 名稱  
- 適用於新增、維護、或更新儀器連線資訊  

---

### 2. **Wavemeter Page (`/wavemeter/[id]`)**
- 監控 **HighFinesse Wavemeter** 狀態  
- 功能：
  - **Run / Stop** 控制儀器監測  
  - **Calibrate** 校正  
  - **Repetition time**：設定 channel 切換等待秒數  
  - **Channel Label 編輯**（支援 Enter / Blur 提交，避免輸入時被即時更新打斷）  
  - **Channel Enabled** 切換 (On/Off)  
  - **Sensor 值設定**（毫秒 ms，會轉換為秒送到硬體層）  
- 支援 **Undo / Redo** 操作  
- 即時監控，表格動態更新  

---

### 3. **USB3104 Analog Page (`/usb3104-analog/[id]`)**
- 控制 **Mcculw USB3104 DAQ** 的 Analog 輸出  
- 功能：
  - 每個 channel 可設定 **Voltage (-10V ~ +10V, 精度 0.001V)**  
  - **鍵盤 ↑/↓** 可依游標所在位數增減 (smart step)  
  - **Channel comment 編輯**（Enter/Blur 提交；Esc 取消）  
  - **即時 RPC**：電壓輸入會在 ~120ms 內送出至 `/api/usb3104-analog/set`  
- 支援 **Undo / Redo**  

---

### 4. **SpinCore Page (`/spincore/[id]`)**
- 控制 **SpinCore Pulse Programmer** 的序列與時間設定  
- 功能：
  - **Sequence 管理**：新增、刪除、移動、複製、匯入/取代  
  - **Timing 管理**：
    - 時間範圍、單位 (s/ms/us/ns)、類型 (WAIT, CONTINUE, BRANCH, LOOP, END_LOOP)、次數  
    - 24-bit channel 控制 (每個 timing 指令對應 24 channel 開關)  
    - 支援拖曳排序、匯入複製、Replace 預覽模式  
  - **Channels 命名**  
  - **Run** 執行當前序列  
- 支援 **Undo / Redo**  
- 視覺化 UI，左側 Sequence、右側 Timing + Channels，可收合面板  

---

### 5. **Instruments Generic Viewer (`/instruments/[id]`)**
- 一般 JSON 檢視頁面  
- 功能：
  - 依照 ID 導向不同頁面：  
    - `0` → `/admin`  
    - `1` → `/wavemeter/[id]`  
    - `2` → `/usb3104-analog/[id]`  
    - `3` → `/spincore/[id]`  
    - 其他 → 顯示原始 JSON 狀態  
- 適合快速檢查尚未實作 UI 的儀器資料  

---

## 🔄 資料流與操作

1. **首次載入**：前端 fetch `/api/page/[id]/meta` 與 `/api/page/[id]/state`  
2. **狀態更新**：  
   - 使用者操作 → `POST /api/page/[id]/mutate`  
   - 成功 → 新版本寫入 & 回傳  
   - 版本衝突 (`409`) → 重新抓取最新狀態  
3. **即時同步**：  
   - 後端推送 `/api/page/[id]/events` (SSE)  
   - 前端比對版本號，更新 UI  
4. **Undo / Redo**：  
   - `/api/page/[id]/undo` / `/redo`  
   - 透過 `pageHistory.ts` 管理  

---

## 🚀 安裝與啟動

### 需求
- Node.js 18+
- npm 或 yarn

### 安裝步驟
```bash
# 安裝相依套件
npm install

# 開發模式啟動
npm run dev

# 建立正式版
npm run build

# 啟動正式版
npm run start
```

伺服器預設會在 `http://localhost:3000` 運行。

---

## 🚀 開發注意事項

- **輸入框**皆使用「本地草稿」策略，避免輸入時被即時事件覆蓋  
- **Commit** 與 **RPC 呼叫**有 debounce，減少頻繁 API 請求  
- **型別安全**：共用型別在 `lib/types.ts`  
- **擴充性**：新增儀器時只需在 `/instruments/[id]` 加入 redirect 或新的 UI page  

---

## ✅ 總結

這個專案是一個 **儀器控制平台**，結合 **React + Next.js 前端 UI** 與 **後端 API/RPC**，提供：
- 儀器狀態可視化  
- 參數設定與提交  
- 即時狀態同步  
- Undo/Redo 操作  
- 易於擴充的架構  
