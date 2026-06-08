# 13. DevOps & Deployment Documentation

## A. Local Environment Setup

### 1. Prerequisites
Ensure you have the following software installed locally:
* **Node.js**: Version `>=20.0.0`
* **NPM**: Version `>=10.0.0`
* **Docker & Docker Compose** (Optional: For containerized environments)

### 2. Standard Monorepo Installation
1. Clone your repository:
   ```bash
   git clone https://github.com/your-username/EvaraOne.git
   cd EvaraOne
   ```
2. Install all dependencies for both backend and frontend packages:
   ```bash
   npm run build
   ```
   *This command runs a multi-step installation script: it installs the main root packages, CD's into `client/` to install frontend packages, builds the client assets, and CD's into `backend/` to install server packages.*

3. Start client and server servers concurrently:
   ```bash
   npm run dev
   ```
   *This launches the backend Nodemon server (port 8081) and Vite client server (port 5173) concurrently. The client proxy configuration automatically routes `/api` calls to port 8081.*

---

## B. Production Deployment Options

### Option 1: Containerized Deployment (Docker)
EvaraOne is fully dockerized for container-based hosting environments (such as AWS ECS, GCP Cloud Run, or DigitalOcean Droplets).

#### 1. Launching via Docker Compose
To spin up the entire application stack locally using Docker:
```bash
docker-compose up --build
```
This runs the services defined in `docker-compose.yml`:
* **`backend`**: Node server running `npm start`.
* **`client`**: Serves built static assets through an Nginx reverse proxy.
* **`redis`**: Redis instance for caching.

#### 2. Nginx Reverse Proxy Configuration (`nginx.conf`)
The Nginx configuration within the client container handles routing, gzip compression, and API proxy passes:
```nginx
server {
    listen 80;
    
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html; # Protect client routing
    }

    # Proxy API calls directly to the Express server
    location /api/v1/ {
        proxy_pass http://backend:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

### Option 2: Cloud Deployment (Railway)
EvaraOne includes a `railway.toml` file to support automated, continuous deployment on **Railway**:

#### 1. Setup Flow
1. Create a new project in the Railway console.
2. Link your GitHub repository.
3. Configure the required environment variables (see [14. Environment Variables](file:///c:/Users/yasha_ambulkar/Downloads/04-05-2026/main/docs/14_environment_variables.md)).
4. Railway will automatically detect the `railway.toml` file and build the application:
   * Installs monorepo dependencies.
   * Compiles the static Vite frontend.
   * Launches the Express backend service.
   * Maps public endpoints securely.
