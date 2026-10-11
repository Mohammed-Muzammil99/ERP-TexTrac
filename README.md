# 🏭 Garment Factory Production & ERP Management System

An enterprise-grade, full-stack **Garment Manufacturing Execution System (MES) & ERP** built to track end-to-end apparel production pipelines—from Buyer Purchase Orders (PO) and Fabric Store Inventory to Cutting, Feeding, Stitching, Press, Finishing, Packing, Ready Goods Store, and Shipping.

Designed with **strict Work-In-Progress (WIP) quantity validation**, **inter-department handovers**, **quality control defect returns**, **shift time-locking**, and **multi-tier Role-Based Access Control (RBAC)**.

---

## ✨ Key Features

### 1. End-to-End 10-Stage Production Pipeline
* **Purchase Orders (PO):** Buyer order intake with style numbers, colorways, size breakdowns (`S, M, L, XL, XXL`), target dates, and BOM allocations.
* **Fabric Store & Ledger:** Raw material inward/outward tracking, supplier logs, and roll consumption per style.
* **Cutting & Feeding:** Bundle creation, layer cutting logs, and line feeding allocation.
* **Stitching (Hourly Slot Tracking):** Line-wise hourly production tracking across 2-hour shift slots (`9–11 AM`, `11–1 PM`, `1–3 PM`, `3–5 PM`, `5–7 PM`).
* **Press, Finishing & Packing:** Ironing, thread trimming, polybagging, and carton packing tracking.
* **Ready Goods Store & Shipping:** Finished carton inventory, buyer dispatch logs, and shipment completion.
* **Custom Department Builder:** Dynamically create custom production stages (e.g., *Embroidery, Washing, Printing*) and insert them into the pipeline.

### 2. Handover, Returns & Unallocated Pool Workflow
* **Inter-Department Handovers:** Upstream departments initiate handovers; downstream departments must verify and **Accept** or **Reject** batches before WIP moves forward.
* **Defect Returns & Rework:** Quality control rejection tracking that returns defective pieces to previous stages or logs permanent **Discards**.
* **Unallocated Holding Pool:** Tracks surplus or unlinked stock and allocates it to active Purchase Orders.

### 3. Enterprise Governance & Access Control (RBAC)
* **3-Tier Role Hierarchy:** `Admin`, `Sub-Admin`, and `User` (Department Operator / Supervisor).
* **Direct Permission Grant Center (Admin Will):** Admins can directly grant or revoke department pipelines, page modules, and shift time-override privileges for any user with 1-click role presets.
* **Access Approval Workflow:** Operators can request temporary department/page access or past-shift unlocks, which Admins/Sub-Admins can approve or reject.
* **Complete Audit Trail:** Every create, update, delete, handover, and permission change is logged with user attribution and timestamps.

### 4. Real-Time Analytics & Export Engine
* **Executive Dashboard & WIP Reports:** Interactive charts (via `Recharts`) displaying stage-wise bottlenecks, order completion rates, and defect ratios.
* **Client-Side Excel & Image Exports:** 1-click `.xlsx` spreadsheet exports (via `SheetJS / xlsx`) and high-resolution `.png` report snapshots (via `html-to-image`).
* **Dynamic Theme Engine:** Live CSS-variable theming supporting Dark/Light mode and customizable department brand colors.

---

## 🛠️ Tech Stack

### Frontend
* **Framework:** React 19 + TypeScript (Vite)
* **Routing:** React Router DOM v7
* **Styling:** Tailwind CSS v4 + CSS Custom Properties (`:root` dynamic theme variables)
* **Data Visualization:** Recharts
* **Icons & UI:** Lucide React, `clsx`, `tailwind-merge`
* **Export Utilities:** `xlsx` (Excel generation), `html-to-image` (PNG snapshots)

### Backend
* **Runtime & Server:** Node.js + Express.js (TypeScript via `tsx`)
* **Database:** SQLite (`better-sqlite3`) running in `WAL` (Write-Ahead Logging) mode for high-concurrency ACID transactions
* **Authentication & Security:** JWT (`jsonwebtoken`), `bcryptjs` password hashing, custom RBAC & route-protection middlewares

---

## 📂 Project Structure

```text
├── src/
│   ├── components/         # Reusable UI, Modals, Handover Lists, RBAC Guards & 10 Report Engines
│   ├── context/            # AuthContext (JWT + RBAC) & ThemeContext (Dynamic CSS Variables)
│   ├── pages/              # 22 Route Pages (Dashboard, PO, Fabric, Cutting -> Shipping, Admin)
│   ├── types/              # Shared TypeScript interfaces and domain models
│   ├── utils/              # Excel/Image export utilities & time-lock validation helpers
│   ├── App.tsx             # Application router and protected layout shell
│   └── main.tsx            # React DOM entry point
├── server.ts               # Express API server, SQLite schema, ACID transactions & RBAC routes
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

---

## 🚀 Getting Started (Run Locally)

### Prerequisites
* **Node.js** (v18 or higher recommended)
* **npm** (v9 or higher)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR-USERNAME/garment-factory-erp.git
cd garment-factory-erp
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables (Optional)
Create a `.env` file in the root directory if you want to customize the JWT secret or port:
```env
PORT=3000
JWT_SECRET=your_super_secret_jwt_key
```

### 4. Start the development server
```bash
npm run dev
```
The full-stack application (Express API + Vite React frontend) will start at:
👉 **`http://localhost:3000`**

---

## 🔐 Default Demo Credentials

When the database initializes for the first time, you can log in or create accounts across the three role tiers:
* **Admin Account:** Full access to all 10 production stages, User Management, Audit Logs, System Settings, and Direct Permission Grants.
* **Sub-Admin Account:** Production floor supervisor access with approval capabilities.
* **Department User:** Scoped access to assigned departments and shift time slots.

---

## 🧠 Key Engineering Highlights

1. **Zero-Overproduction WIP Guardrails:** Both frontend forms and backend SQLite transactions validate that `Completed + Handed Over <= Received WIP`, preventing ghost inventory.
2. **ACID Database Transactions:** Multi-table operations (such as accepting a handover or approving a permission request) execute inside `db.transaction(...)` blocks to ensure data integrity.
3. **Shift Time-Locking:** Automatically locks hourly production slots once the shift window expires, requiring either an Admin override or an approved time-access grant.
