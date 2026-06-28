"""Main FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import re

from .api import routes as api_routes
from .websocket import handler as ws_handler

# Create FastAPI app
app = FastAPI(
    title="Black Queen API",
    description="Multiplayer card game API",
    version="1.0.0"
)

# Configure CORS
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:5174"
).split(",")
cors_origins = [origin.strip() for origin in cors_origins if origin.strip()]

cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"https://.*\.vercel\.app")
if not cors_origin_regex:
    cors_origin_regex = None
else:
    # Keep the regex valid even if the environment value is malformed.
    try:
        re.compile(cors_origin_regex)
    except re.error:
        cors_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=3600,
)

# Include routers
app.include_router(api_routes.router)
app.include_router(ws_handler.router)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/")
def root():
    """Root endpoint."""
    return {"message": "Black Queen API", "version": "1.0.0"}
