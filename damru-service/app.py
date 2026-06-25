import logging
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from damru_manager import manager
from config import FLASK_PORT, DEBUG, LOG_LEVEL
import asyncio

# Setup logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create Flask app
app = Flask(__name__)
CORS(app)

# Store event loop for async operations
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)


def run_async(coro):
    """Helper to run async functions in sync Flask context."""
    return loop.run_until_complete(coro)


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    health_status = run_async(manager.health_check())
    status_code = 200 if health_status["status"] == "healthy" else 503
    return jsonify(health_status), status_code


@app.route("/api/status", methods=["GET"])
def status():
    """Get current pool status."""
    status_data = run_async(manager.health_check())
    return jsonify(status_data), 200


@app.route("/api/navigate", methods=["POST"])
def navigate():
    """
    Navigate to a URL with stealth automation.

    Request body:
    {
        "url": "https://example.com",
        "device": "pixel_8_pro",
        "proxy": "socks5://user:pass@host:port",
        "timeout": 30000,
        "screenshot": false
    }
    """
    try:
        data = request.get_json()

        if not data or "url" not in data:
            return jsonify({"error": "Missing required 'url' field"}), 400

        result = run_async(
            manager.navigate(
                url=data.get("url"),
                device=data.get("device", "random"),
                proxy=data.get("proxy"),
                timeout=data.get("timeout", 30000),
                screenshot=data.get("screenshot", False),
            )
        )

        return jsonify(result), 200 if result.get("success") else 400

    except Exception as e:
        logger.error(f"Navigate endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/scrape", methods=["POST"])
def scrape():
    """
    Scrape content from a URL.

    Request body:
    {
        "url": "https://example.com",
        "device": "pixel_8_pro",
        "proxy": "socks5://...",
        "selectors": {
            "title": "h1",
            "price": ".price"
        }
    }
    """
    try:
        data = request.get_json()

        if not data or "url" not in data:
            return jsonify({"error": "Missing required 'url' field"}), 400

        result = run_async(
            manager.scrape(
                url=data.get("url"),
                device=data.get("device", "random"),
                proxy=data.get("proxy"),
                selectors=data.get("selectors"),
            )
        )

        return jsonify(result), 200 if result.get("success") else 400

    except Exception as e:
        logger.error(f"Scrape endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/screenshot", methods=["POST"])
def screenshot():
    """
    Capture an Android screenshot.

    Request body:
    {
        "device": "pixel_8_pro",
        "output_path": "screenshot.png"
    }
    """
    try:
        data = request.get_json() or {}

        result = run_async(
            manager.screenshot(
                device=data.get("device", "random"),
                output_path=data.get("output_path", "screenshot.png"),
            )
        )

        return jsonify(result), 200 if result.get("success") else 400

    except Exception as e:
        logger.error(f"Screenshot endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/devices", methods=["GET"])
def devices():
    """List available device profiles."""
    # This would list Damru's 155 device profiles
    return (
        jsonify(
            {
                "devices": [
                    "pixel_8_pro",
                    "pixel_8",
                    "samsung_galaxy_s24_ultra",
                    "samsung_galaxy_s24",
                    "random",
                ],
                "total": 155,
                "note": "Full device list available in Damru documentation",
            }
        ),
        200,
    )


@app.route("/api/cleanup", methods=["POST"])
def cleanup():
    """Cleanup and close all active sessions."""
    try:
        run_async(manager.cleanup())
        return jsonify({"status": "cleaned up"}), 200
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/type", methods=["POST"])
def type_input():
    """
    Type text into an input field with human-like delays.

    Request body:
    {
        "selector": "input[id='username']",
        "text": "user@example.com",
        "device": "pixel_8_pro",
        "human_like": true,
        "delay_min": 45,
        "delay_max": 110
    }
    """
    try:
        data = request.get_json()
        if not data or "selector" not in data or "text" not in data:
            return jsonify({"error": "Missing 'selector' or 'text'"}), 400

        result = run_async(
            manager.type_input(
                selector=data.get("selector"),
                text=data.get("text"),
                device=data.get("device", "random"),
                human_like=data.get("human_like", True),
                delay_min=data.get("delay_min", 45),
                delay_max=data.get("delay_max", 110),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Type endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/click", methods=["POST"])
def click():
    """
    Click an element with retry logic.

    Request body:
    {
        "selector": "button[type='submit']",
        "device": "pixel_8_pro",
        "retries": 3,
        "wait_visible_timeout": 7000
    }
    """
    try:
        data = request.get_json()
        if not data or "selector" not in data:
            return jsonify({"error": "Missing 'selector'"}), 400

        result = run_async(
            manager.click(
                selector=data.get("selector"),
                device=data.get("device", "random"),
                retries=data.get("retries", 3),
                wait_visible_timeout=data.get("wait_visible_timeout", 7000),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Click endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/wait", methods=["POST"])
def wait_for_element():
    """
    Wait for an element to reach a specific state.

    Request body:
    {
        "selector": "input[id='code']",
        "device": "pixel_8_pro",
        "timeout": 10000,
        "state": "visible"
    }
    """
    try:
        data = request.get_json()
        if not data or "selector" not in data:
            return jsonify({"error": "Missing 'selector'"}), 400

        result = run_async(
            manager.wait_for_element(
                selector=data.get("selector"),
                device=data.get("device", "random"),
                timeout=data.get("timeout", 10000),
                state=data.get("state", "visible"),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Wait endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/fill", methods=["POST"])
def fill_input():
    """
    Fill a form field (select all + type with human behavior).

    Request body:
    {
        "selector": "input[id='username']",
        "value": "user@example.com",
        "device": "pixel_8_pro",
        "human_like": true
    }
    """
    try:
        data = request.get_json()
        if not data or "selector" not in data or "value" not in data:
            return jsonify({"error": "Missing 'selector' or 'value'"}), 400

        result = run_async(
            manager.fill_input(
                selector=data.get("selector"),
                value=data.get("value"),
                device=data.get("device", "random"),
                human_like=data.get("human_like", True),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Fill endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/submit", methods=["POST"])
def submit_form():
    """
    Submit a form by pressing Enter.

    Request body:
    {
        "selector": "form[id='loginForm']",
        "device": "pixel_8_pro"
    }
    """
    try:
        data = request.get_json()
        if not data or "selector" not in data:
            return jsonify({"error": "Missing 'selector'"}), 400

        result = run_async(
            manager.submit_form(
                selector=data.get("selector"),
                device=data.get("device", "random"),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Submit endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/press", methods=["POST"])
def press_key():
    """
    Press a keyboard key.

    Request body:
    {
        "key": "Enter",
        "device": "pixel_8_pro",
        "count": 1
    }

    Valid keys: Enter, Tab, Escape, Control+A, Control+C, etc.
    """
    try:
        data = request.get_json()
        if not data or "key" not in data:
            return jsonify({"error": "Missing 'key'"}), 400

        result = run_async(
            manager.press_key(
                key=data.get("key"),
                device=data.get("device", "random"),
                count=data.get("count", 1),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Press endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/execute", methods=["POST"])
def execute_script():
    """
    Execute JavaScript on the page.

    Request body:
    {
        "script": "document.title",
        "device": "pixel_8_pro"
    }
    """
    try:
        data = request.get_json()
        if not data or "script" not in data:
            return jsonify({"error": "Missing 'script'"}), 400

        result = run_async(
            manager.execute_script(
                script=data.get("script"),
                device=data.get("device", "random"),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Execute endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/content", methods=["POST"])
def get_page_content():
    """
    Get page content or extract specific elements.

    Request body:
    {
        "selectors": {
            "title": "h1",
            "error": ".error-message"
        },
        "device": "pixel_8_pro"
    }
    """
    try:
        data = request.get_json() or {}

        result = run_async(
            manager.get_page_content(
                selectors=data.get("selectors"),
                device=data.get("device", "random"),
            )
        )
        return jsonify(result), 200 if result.get("success") else 400
    except Exception as e:
        logger.error(f"Content endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    logger.info("Starting Damru API Service...")
    logger.info(f"Running on port {FLASK_PORT}")

    try:
        # Initialize and run health check on startup
        health = run_async(manager.health_check())
        logger.info(f"Initial health check: {health}")

        app.run(
            host="0.0.0.0", port=FLASK_PORT, debug=DEBUG, use_reloader=False
        )
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        run_async(manager.cleanup())
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise
