Here is the final, comprehensive, structured list of **all the features** of your **PatientLab** application, clearly incorporating all your requirements:

---

## 🎙️ **1. Core Interaction Modes**

* **Speak Mode (Speech-to-Speech)**

  * Real-time voice conversations with agents
  * WebRTC integration (OpenAI Realtime API)
  * Voice Activity Detection (VAD)
  * Push-to-talk toggle option

* **Write Mode (Text Interaction)**

  * Text-based chat interface with agents
  * No audio input or output active in this mode

* **Mode Switching**

  * Seamless toggle between Speak and Write modes
  * Proper cleanup of mic/audio states

---

## 🤖 **2. Conversational Agents**

* **Multiple AI Agents**

  * **Patient Agent:** Realistic simulation of patient responses
  * **Preceptor Agent:** Provides personalized, rubric-based feedback on user interactions
  * **Differential Diagnosis (DDx) Agent:** Conversational support for differential diagnosis wizard

* **Agent-Specific Context Management**

  * Individual conversation transcripts per agent
  * Distinct voices, avatars, and interaction styles per agent
  * Unique instructions and prompt guardrails per agent

* **Agent Switching**

  * Persistent on-screen UI to switch conversational agents dynamically
  * Separate conversational context loaded per agent

---

## 📁 **3. Case-Based Learning System**

* **Multiple Case Support**

  * Defined and structured via YAML configuration files
  * Configurable agent behaviors, DDx fields, and evaluation rubrics per case

* **Differential Diagnosis (DDx) Wizard**

  * Activated after learner asks patient 4 questions
  * Interactive wizard helps students enter "can't miss" diagnoses and rule-outs
  * Supported by the conversational DDx agent
  * Adheres strictly to UBC standards (fields configured per case)

---

## 📌 **4. User Interface & User Experience**

* **Dual-Avatar Interaction Screen**

  * Separate avatars for the learner and AI agent
  * Active-turn indicator (underline beneath the speaking avatar)

* **Mic Activity Feedback**

  * Animated mic activity indicator showing live responsiveness

* **Agent Introductory Interaction**

  * One-time audio intro per agent at initial load
  * Simulated "Hi" message upon subsequent agent load

* **Settings Panel**

  * User selection of microphone and audio output devices
  * Settings persisted using LocalStorage

* **Restart Session Button**

  * Clears session context, restarts app interaction

---

## 📑 **5. Transcript & Session Management**

* **Transcript Storage**

  * Stores complete conversation transcripts per agent in browser LocalStorage

* **One-Click Transcript Download**

  * Easy download of entire interaction history in readable `.txt` format for learner review

---

## 🚨 **6. Error Handling & Reliability**

* **Graceful Error Management**

  * Clear UI notifications for connection or API errors
  * Auto-retry logic for dropped WebRTC connections with incremental back-off
  * User manual controls available to initiate reconnection attempts

---

## 🧑‍🏫 **7. Feedback & Evaluation System**

* **Personalized Feedback via Preceptor Agent**

  * Transcript reviewed by Preceptor agent through OpenAI reasoning calls
  * Feedback aligned with structured rubric categories from YAML case files
  * Scored evaluation presented using clear 5-star ratings per rubric dimension

    * ⭐⭐⭐⭐⭐ (Excellent), ⭐⭐⭐⭐ (Good), ⭐⭐⭐ (Fair), ⭐⭐ (Needs Improvement), ⭐ (Poor), or "N/A" (Insufficient data)
  * Short narrative commentary per rubric dimension (optional)

* **Feedback Screen Accessibility**

  * Automatically displayed upon DDx completion
  * Accessible manually through dedicated feedback button anytime after patient interaction

---

## 🔑 **8. Authentication & LMS Integration**

* **Entrada LMS Integration (Basic LTI 1.1)**

  * Secure app launch and user authentication via LMS context

* **OAuth 2.0 Authentication**

  * Securely authenticates API logging requests to Oracle APEX

---

## 📊 **9. Logging & Data Collection**

* **Event and Message Logging**

  * Secure logging of user events, agent interactions, and timestamps
  * Data transmitted to Oracle APEX via authenticated REST API calls

---

## ⚙️ **10. Infrastructure & Deployment**

* **Backend API**

  * Built with FastAPI (Python)
  * Manages LTI launches, ephemeral key creation, and case content delivery
  * Served locally by Uvicorn (development) and Gunicorn (production)

* **Deployment Environment**

  * RedHat Enterprise Linux (RHEL)
  * Static frontend assets served via Nginx reverse proxy
  * Backend service managed by systemd

* **Deployment Workflow**

  * Manual deployment scripts (`bash` scripts executed over SSH)
  * `.env` file manually maintained with secrets and environment variables

---

## ♿ **11. Accessibility & Compliance**

* **Accessibility Target**

  * UI designed to meet WCAG AA compliance
  * Accessibility features integrated into UI design (no automated testing)

---

## 🛠️ **12. Development & Maintenance**

* **Frontend Technology Stack**

  * React, Vite, TypeScript, Tailwind CSS, ShadCN UI, Framer Motion
  * XState v5 for structured state management

* **Backend Technology Stack**

  * Python, FastAPI, uv, Uvicorn (dev), Gunicorn + Uvicorn workers (prod), ims-lti-py

* **Testing Approach**

  * Manual testing and QA processes only (initially)

* **Monitoring & Analytics**

  * Error logging on backend server; no additional analytics or external monitoring

* **Case File Authoring**

  * YAML-based structured configuration for defining scenarios, agent behavior, and evaluation rubrics

---

This comprehensive list fully reflects every feature and requirement you've described for the **PatientLab** application.
