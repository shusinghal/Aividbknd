
# Narrative Nexus AI - Backend Server

This backend serves as a secure and robust server-side counterpart to the Narrative Nexus AI frontend. It handles all interactions with external APIs, including Google Gemini, ElevenLabs, Pexels, and the GitHub API for data persistence.

The primary goals of this backend are:
- **Security:** Securely manage all API keys and secrets, removing them entirely from the client-side application.
- **Control:** Centralize business logic and interactions with third-party services.
- **Scalability:** Provide a foundation that can be easily deployed and scaled on cloud platforms like Google Cloud.

## Tech Stack

- **Node.js:** JavaScript runtime environment.
- **Express.js:** Fast, unopinionated, minimalist web framework for Node.js.
- **TypeScript:** Typed superset of JavaScript that compiles to plain JavaScript.
- **Dotenv:** For managing environment variables.

---

## 1. Setup & Installation

Follow these steps to get the backend server running locally.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Run the installation script:**
    This script will install all the necessary `npm` packages.
    ```bash
    ./install.sh
    ```
    (If you are on Windows, you can just run `npm install`).

3.  **Set up Environment Variables:**
    Create a `.env` file in the `backend/` directory by copying the example file.
    ```bash
    cp .env.example .env
    ```
    Now, open the `.env` file and fill in your actual API keys and secrets. **This file should not be committed to version control.**

    ```dotenv
    # backend/.env

    # GitHub: For saving/loading companies, niches, and assets
    # Create a Personal Access Token with `repo` scope.
    GITHUB_TOKEN="ghp_..."
    GITHUB_COMPANIES_REPO_URL="https://raw.githubusercontent.com/..."
    GITHUB_NICHES_REPO_URL="https://raw.githubusercontent.com/..."

    # Generative AI Services
    GEMINI_API_KEY="AIzaSy..."
    ELEVENLABS_API_KEY="sk_..."
    PEXELS_API_KEY="..."

    # Google Cloud TTS (using a Service Account)
    # Copy the contents of your google_service_account.json file here
    GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL="your-email@...iam.gserviceaccount.com"
    # IMPORTANT: Format the private key to be a single line in the .env file.
    # Replace all newline characters with `\n`.
    # For example: "-----BEGIN PRIVATE KEY-----\nMIIC/A...\n-----END PRIVATE KEY-----\n"
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
    ```

---

## 2. Running the Server

### Development Mode

This command uses `ts-node-dev` to automatically restart the server whenever you make changes to the code.

```bash
npm run dev
```

The server will start on `http://localhost:8080`. Your frontend application will now be able to communicate with it.

### Production Mode

This command first compiles the TypeScript code to JavaScript in the `dist/` directory and then runs the compiled code.

```bash
npm start
```

---

## 3. API Endpoints

The backend exposes the following RESTful API endpoints.

-   `GET /api/companies`: Fetches all saved companies.
-   `PUT /api/companies`: Saves or updates a company.
-   `DELETE /api/companies/:name`: Deletes a company.
-   `GET /api/niches`: Fetches all saved niches.
-   `PUT /api/niches`: Saves or updates a niche.
-   `GET /api/assets/video-groups`: Fetches all generated assets (images, audio, video) grouped by project.
-   `DELETE /api/assets/image/:name`: Deletes an image asset.
-   `DELETE /api/assets/audio/:name`: Deletes an audio asset.
-   `DELETE /api/assets/video/:name`: Deletes a video asset.
-   `POST /api/generate/scan-niche`: Scans for companies in a niche using Gemini.
-   `POST /api/generate/marketing-insights`: Generates marketing insights for a company.
-   `POST /api/generate/video-idea`: Runs the full AI team collaboration to generate a video plan.
-   `POST /api/generate/assets`: Generates and saves static images and narration audio for a video plan.
-   `POST /api/generate/animated-video`: Generates and saves an animated video for a video plan.
-   `POST /api/generate/tts`: A general-purpose endpoint for text-to-speech generation.

---

## 4. Deployment to Google Cloud

This backend is designed to be easily deployed to Google Cloud's App Engine.

### `app.yaml` Configuration

An `app.yaml` file is required for App Engine deployment. Create this file in the `backend/` directory:

```yaml
# backend/app.yaml
runtime: nodejs20
instance_class: F1

env_variables:
  GITHUB_TOKEN: "YOUR_GITHUB_TOKEN"
  GITHUB_COMPANIES_REPO_URL: "YOUR_GITHUB_COMPANIES_URL"
  GITHUB_NICHES_REPO_URL: "YOUR_GITHUB_NICHES_URL"
  GEMINI_API_KEY: "YOUR_GEMINI_KEY"
  ELEVENLABS_API_KEY: "YOUR_ELEVENLABS_KEY"
  PEXELS_API_KEY: "YOUR_PEXELS_KEY"
  GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: "YOUR_SERVICE_ACCOUNT_EMAIL"
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "YOUR_FORMATTED_PRIVATE_KEY"

handlers:
- url: /.*
  script: auto
```

**Note:** You must replace the placeholder values in `app.yaml` with your actual secrets. While this is better than exposing them on the frontend, the most secure method is to use Google Secret Manager.

### Deployment Steps

1.  **Install the gcloud CLI:** Follow the [official instructions](https://cloud.google.com/sdk/docs/install).
2.  **Authenticate:**
    ```bash
    gcloud auth login
    ```
3.  **Set your project:**
    ```bash
    gcloud config set project YOUR_PROJECT_ID
    ```
4.  **Deploy the app:**
    From the `backend/` directory, run:
    ```bash
    gcloud app deploy
    ```
    Follow the prompts. Once deployed, you will get a URL for your live backend. Remember to update your frontend to point to this new URL instead of `http://localhost:8080`.
