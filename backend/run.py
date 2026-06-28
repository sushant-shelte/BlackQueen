"""FastAPI uvicorn server entry point with optional frontend dev server."""
import uvicorn
import os
import subprocess
import sys
import time

def run_backend(host, port, debug):
    """Start FastAPI backend."""
    print(f"🎮 Starting Black Queen Backend on {host}:{port}")
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=debug
    )

def run_frontend_and_backend(host, port, debug):
    """Start both backend and frontend dev servers."""
    print("🎮 Starting Black Queen Backend and Frontend...")
    
    # Start backend in background
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", 
         "--host", host, "--port", str(port),
         "--reload"] if debug else [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", host, "--port", str(port)],
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    
    print(f"✓ Backend started on {host}:{port}")
    time.sleep(2)  # Give backend time to start
    
    # Start frontend in background
    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
    frontend_process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=frontend_dir,
        shell=True
    )
    
    print("✓ Frontend starting on http://localhost:5173")
    print("\n📋 Both servers are running!")
    print("   Backend: http://localhost:8000/docs (Swagger UI)")
    print("   Frontend: http://localhost:5173")
    print("\nPress Ctrl+C to stop both servers...\n")
    
    try:
        # Keep both processes alive
        backend_process.wait()
        frontend_process.wait()
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        backend_process.terminate()
        frontend_process.terminate()
        backend_process.wait(timeout=5)
        frontend_process.wait(timeout=5)
        print("✓ Both servers stopped")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("DEBUG", "True") == "True"
    
    # Check if --full flag is provided to run both backend and frontend
    if "--full" in sys.argv or "--both" in sys.argv:
        run_frontend_and_backend(host, port, debug)
    else:
        # Default: run only backend
        run_backend(host, port, debug)
