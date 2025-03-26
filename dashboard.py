#!/usr/bin/env python3
"""
Simple HTTP server for the dependency monitor dashboard.
This serves the web dashboard files and the report data.
"""

import os
import sys
import argparse
import http.server
import socketserver
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("dashboard-server")

# Default configuration
DEFAULT_PORT = 8080
DEFAULT_REPORTS_DIR = "reports"
DEFAULT_DASHBOARD_DIR = "dashboard"


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler for the dashboard server"""
    
    def __init__(self, *args, reports_dir=None, dashboard_dir=None, **kwargs):
        self.reports_dir = Path(reports_dir) if reports_dir else None
        self.dashboard_dir = Path(dashboard_dir) if dashboard_dir else None
        super().__init__(*args, **kwargs)
    
    def translate_path(self, path):
        """Translate URL path to file system path"""
        # Convert path to a clean, absolute path
        path = super().translate_path(path)
        
        # Default directory is the dashboard directory
        if self.dashboard_dir:
            # If path is the server root or reports directory
            if path == self.directory or path == os.path.join(self.directory, "reports"):
                return str(self.dashboard_dir)
            
            # If path is under the reports directory
            if path.startswith(os.path.join(self.directory, "reports/")):
                # Extract the file name and return reports dir + filename
                filename = os.path.basename(path)
                return str(self.reports_dir / filename)
            
            # For all other paths, serve from dashboard directory
            rel_path = os.path.relpath(path, self.directory)
            return str(self.dashboard_dir / rel_path)
        
        return path


def run_server(port=DEFAULT_PORT, reports_dir=DEFAULT_REPORTS_DIR, dashboard_dir=DEFAULT_DASHBOARD_DIR):
    """Run the dashboard server"""
    # Ensure the reports directory exists
    reports_path = Path(reports_dir)
    if not reports_path.exists():
        logger.warning(f"Reports directory does not exist: {reports_dir}")
        reports_path.mkdir(parents=True, exist_ok=True)
    
    # Ensure the dashboard directory exists
    dashboard_path = Path(dashboard_dir)
    if not dashboard_path.exists():
        logger.error(f"Dashboard directory does not exist: {dashboard_dir}")
        sys.exit(1)
    
    # Copy the HTML file to the dashboard directory
    index_path = dashboard_path / "index.html"
    if not index_path.exists():
        logger.warning("No index.html found in dashboard directory")
    
    # Create a request handler with our custom class
    handler = lambda *args, **kwargs: DashboardHandler(
        *args, 
        reports_dir=reports_path, 
        dashboard_dir=dashboard_path, 
        **kwargs
    )
    
    # Start the server
    with socketserver.TCPServer(("", port), handler) as httpd:
        logger.info(f"Starting dashboard server at http://localhost:{port}")
        logger.info(f"Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Server stopped")


def main():
    """Main entry point for the dashboard server"""
    parser = argparse.ArgumentParser(description="Dependency Monitor Dashboard Server")
    parser.add_argument(
        "--port", 
        type=int,
        default=DEFAULT_PORT,
        help=f"Port to run the server on (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--reports-dir",
        default=DEFAULT_REPORTS_DIR,
        help=f"Directory containing the reports (default: {DEFAULT_REPORTS_DIR})"
    )
    parser.add_argument(
        "--dashboard-dir",
        default=DEFAULT_DASHBOARD_DIR,
        help=f"Directory containing the dashboard files (default: {DEFAULT_DASHBOARD_DIR})"
    )
    args = parser.parse_args()
    
    run_server(args.port, args.reports_dir, args.dashboard_dir)


if __name__ == "__main__":
    main()