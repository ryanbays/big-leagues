import os

# Flask Configuration
FLASK_ENV = os.getenv("FLASK_ENV", "production")
DEBUG = FLASK_ENV == "development"
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))

# Redroid/ADB Configuration
REDROID_HOST = os.getenv("REDROID_HOST", "damru-redroid")
REDROID_PORT = int(os.getenv("REDROID_PORT", 5555))
ADB_DEVICE_TCP = f"{REDROID_HOST}:{REDROID_PORT}"

# Damru Pool Configuration
NUM_DEVICES = int(os.getenv("NUM_DEVICES", 2))
REDROID_CPUS = float(os.getenv("REDROID_CPUS", 2.0))
REDROID_MEMORY = os.getenv("REDROID_MEMORY", "2g")
CHROME_APK = os.getenv("CHROME_APK", None)

# File output configuration
SCREENSHOT_ROOT = os.getenv("SCREENSHOT_ROOT", "/home/damru/screenshots")

# Default settings
DEFAULT_DEVICE_PROFILE = "random"
DEFAULT_TIMEOUT = 30000
REQUEST_TIMEOUT = 60

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# API Settings
MAX_WORKERS = int(os.getenv("MAX_WORKERS", 5))
WORKER_TIMEOUT = int(os.getenv("WORKER_TIMEOUT", 120))
