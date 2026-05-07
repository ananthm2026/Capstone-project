# Run commands:
> Backend :
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

> frontend :
cd react-frontend
npm run dev

> Chrome Extension
cd chrome-extension
npm run build

> Mobile App (Expo)
cd mobile-app
npx expo start

> Desktop Widget (Development)
cd desktop-widget
npm install
npm start

> Desktop Widget (Build Production DMG)
cd desktop-widget
npm install
npm run dist

Once finished, the `.dmg` installer will be in `desktop-widget/dist/`.
Double-click the DMG → drag SeedlingSpeaks Widget to Applications.
The widget auto-enables on launch — no web app needed.

### 💡 Updating the Widget
If you make changes to the code in `desktop-widget/`, you must rebuild the DMG for those changes to be reflected in the installed app:
1. Run `npm run dist` again.
2. Open the new `.dmg` in `dist/`.
3. Drag it to **Applications** and select **"Replace"** when macOS asks.

After the extension builds:
1. Open Chrome → chrome://extensions
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the chrome-extension/dist folder
5. The extension is now loaded

# 🌍 Voice Translation App

A full-stack multilingual voice translation application that converts speech from Indian regional languages to English, applies tone styling, and translates back to native languages. Built with React (frontend) and FastAPI (backend), powered by Sarvam AI and Google Gemini.

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [API Endpoints](#api-endpoints)
- [Supported Languages](#supported-languages)
- [How It Works](#how-it-works)
- [Usage Guide](#usage-guide)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This application provides a seamless workflow for multilingual communication:

1. **Voice Input**: Record audio in any supported Indian regional language
2. **Speech-to-Text Translation**: Convert speech to English text using Sarvam AI
3. **Tone Styling**: Apply professional tone styles (Email, Slack, LinkedIn) using Google Gemini
4. **Text Translation**: Translate styled English text back to any Indian regional language

Perfect for professionals who need to communicate across language barriers while maintaining appropriate tone and context.

---

## ✨ Features

### Core Functionality
- 🎤 **Voice Recording**: Record audio directly from browser or mobile device
- 🗣️ **Speech-to-Text Translation**: Automatic transcription and translation to English
- 🎨 **Tone Styling**: Apply predefined or custom tone styles to text
- 🌐 **Multi-Language Support**: Translate to 10+ Indian regional languages
- 📱 **Mobile Responsive**: Works on all screen sizes with native-like feel

### Tone Styles
- **Email Formal**: Professional language with proper salutations
- **Email Casual**: Friendly but professional, conversational
- **Slack**: Casual, short messages with emoji support
- **LinkedIn**: Thought leadership tone with hashtag suggestions
- **User Override**: Custom tone descriptions

### Supported Languages
Hindi, Bengali, Tamil, Telugu, Malayalam, Marathi, Gujarati, Kannada, Punjabi, Odia

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                           │
│  (Web/Mobile - Tailwind CSS UI)                             │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP/REST API
┌─────────────────▼───────────────────────────────────────────┐
│                   FastAPI Backend                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/translate-audio    (Audio → English)           │  │
│  │  /api/rewrite-tone       (Tone Styling)              │  │
│  │  /api/translate-text     (English → Native)          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐  ┌────────▼─────────┐
│   Sarvam AI    │  │  Google Gemini   │
│                │  │                  │
│ • Speech-to-   │  │ • Tone Rewriting │
│   Text         │  │ • Style          │
│ • Translation  │  │   Application    │
└────────────────┘  └──────────────────┘
```

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router
- **HTTP**: Axios with retry logic
- **Icons**: Lucide React

### Backend
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn
- **Key Libraries**:
  - `fastapi`: Web framework
  - `pydantic`: Data validation
  - `sqlalchemy`: PostgreSQL ORM
  - `python-jose`: JWT authentication
  - `google-generativeai`: Gemini AI integration
  - `python-multipart`: File upload handling

### External APIs
- **Sarvam AI**: Speech-to-text translation and text translation
- **Google Gemini**: AI-powered tone rewriting and vision translation

---

## 📁 Project Structure

```
Capstone-project/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env
│   ├── database.py
│   └── models.py
├── react-frontend/
│   ├── src/
│   └── package.json
├── mobile-app/
│   ├── app/
│   ├── app.json
│   └── package.json
├── desktop-widget/
│   └── package.json
├── chrome-extension/
│   ├── public/
│   └── src/
└── README.md
```

---

## 🚀 Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 18+
- Sarvam AI API Key ([Get it here](https://www.sarvam.ai/))
- Google Gemini API Key ([Get it here](https://ai.google.dev/))

### Backend Setup

1. **Navigate to backend directory**:
```bash
cd backend
```

2. **Create virtual environment**:
```bash
python3 -m venv venv
source venv/bin/activate
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

4. **Configure environment variables** — create `.env`:
```env
SARVAM_API_KEY=your_sarvam_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=postgresql://user:password@localhost:5432/seedlingspeaks
SECRET_KEY=your_jwt_secret
```

5. **Run the server**:
```bash
uvicorn main:app --reload --port 8000
```

### Frontend Setup

1. **Navigate to frontend directory**:
```bash
cd react-frontend
```

2. **Install dependencies**:
```bash
npm install
```

3. **Run dev server**:
```bash
npm run dev
```

App runs at `http://localhost:5173`

### Chrome Extension

```bash
cd chrome-extension
npm install
npm run build
```

Load `chrome-extension/dist` as unpacked extension in `chrome://extensions`.

### Mobile App (Expo) Setup

1. **Navigate to mobile-app directory**:
```bash
cd mobile-app
```

2. **Install dependencies**:
```bash
npm install
```

3. **Start Expo**:
```bash
npx expo start --clear
```

---

## 🔌 API Endpoints

### Translate Audio
`POST /api/translate-audio` — Audio → English transcript

### Rewrite Tone
`POST /api/rewrite-tone` — Apply tone styling via Gemini

### Translate Text
`POST /api/translate-text` — English → Native language

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

---

## 🌐 Supported Languages

| Language   | Code    |
|------------|---------|
| Hindi      | hi-IN   |
| Bengali    | bn-IN   |
| Tamil      | ta-IN   |
| Telugu     | te-IN   |
| Malayalam  | ml-IN   |
| Marathi    | mr-IN   |
| Gujarati   | gu-IN   |
| Kannada    | kn-IN   |
| Punjabi    | pa-IN   |
| Odia       | or-IN   |

---

## 🔐 Environment Variables

```env
SARVAM_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://...
SECRET_KEY=your_jwt_secret_key
```

---

## 🐛 Troubleshooting

**Backend not starting** — check venv is activated and `.env` exists

**ECONNREFUSED on frontend** — backend isn't running, start it first

**Sarvam 401** — invalid or expired API key

**Microphone denied** — grant permissions in browser settings

**Chrome extension not working** — rebuild with `npm run build` and reload in `chrome://extensions`

---

## 📄 License

This project is for educational and demonstration purposes.

---

**Built with ❤️ for multilingual communication**
