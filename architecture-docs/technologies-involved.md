Here is a succinct, categorized list of **all technologies** involved in the project, along with their specific roles:

---

## 🔧 **Frontend (User Interface)**

| Technology        | Role                                                           |
| ----------------- | -------------------------------------------------------------- |
| **React**         | Core UI framework                                              |
| **Vite**          | Build tool for fast dev and production builds                  |
| **TypeScript**    | Type safety for React, XState, and API interactions            |
| **Tailwind CSS**  | Utility-first styling, responsive and accessible design        |
| **Framer Motion** | Animations and smooth transitions (e.g., between agents/modes) |
| **React Router**  | Page and mode routing (`/speak`, `/write`)                     |
| **WebRTC APIs**   | Real-time audio input/output with OpenAI Realtime API          |
| **XState v5**     | State machines for session, agent, audio, and mode control     |
| **@xstate/react** | React bindings for XState                                      |

---

## 🔙 **Backend (API & LTI Integration)**

| Technology     | Role                                                        |
| -------------- | ----------------------------------------------------------- |
| **FastAPI**    | Backend web framework for API endpoints and LTI integration |
| **uv**         | Dependency and virtualenv manager for Python                |
| **Uvicorn**    | ASGI server for development                                 |
| **Gunicorn**   | Production server (with `UvicornWorker`)                    |
| **ims-lti-py** | Validates LTI 1.1 launches from Entrada LMS                 |
| **dotenv**     | Manages API keys and environment config via `.env` files    |

---

## 🔐 **Authentication & LMS Integration**

| Technology        | Role                                              |
| ----------------- | ------------------------------------------------- |
| **Basic LTI 1.1** | Authenticates users and launches from Entrada LMS |
| **OAuth 2.0**     | Authenticates logging requests to Oracle APEX     |

---

## 📊 **Data Logging & Analytics**

| Technology      | Role                                                          |
| --------------- | ------------------------------------------------------------- |
| **Oracle APEX** | Logs user events and messages via authenticated POST requests |

---

## 🚀 **Deployment & Hosting**

| Technology       | Role                                                      |
| ---------------- | --------------------------------------------------------- |
| **RHEL**         | Target server OS                                          |
| **systemd**      | Service manager for backend (runs FastAPI via Gunicorn)   |
| **Nginx**        | Reverse proxy for HTTPS, static asset serving             |
| **Certbot**      | (Optional) TLS certificate provisioning via Let's Encrypt |
| **bash scripts** | Automates development and deployment tasks                |

---

## 🧪 **Development & Collaboration**

| Technology            | Role                                                       |
| --------------------- | ---------------------------------------------------------- |
| **VS Code**           | Development environment                                    |
| **Git + GitHub**      | Version control and team collaboration                     |
| **README + scripts/** | Onboarding and training support for co-op students         |
| **XState Visualizer** | (Optional) Visual debug and modeling of app state machines |
