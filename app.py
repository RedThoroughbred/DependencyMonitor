#!/usr/bin/env python3
"""
Dependency Health Monitor - Integrated Application

A tool for tracking package health across multiple projects and package ecosystems.
This version integrates the dependency monitor and dashboard into a single application.
"""

import os
import sys
import json
import csv
import time
import argparse
import logging
import datetime
import threading
import webbrowser
from pathlib import Path
from typing import Dict, List, Optional, Union, Tuple, Any

import requests
import pandas as pd
import yaml
import flask
from flask import Flask, render_template, jsonify, request, redirect, url_for, send_from_directory, Response
from dateutil import parser
from packaging import version as pkg_version

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("dependency-monitor")

# Default configuration path
DEFAULT_CONFIG_PATH = "config/config.yaml"

# Initialize Flask app
app = Flask(__name__, 
            static_folder="dashboard",
            static_url_path="")

# Global variable to store the monitor instance
monitor = None


class Cache:
    """Simple caching mechanism for API responses"""
    
    def __init__(self, config):
        self.enabled = config["cache"]["enabled"]
        self.ttl = config["cache"]["ttl"]
        self.cache_dir = Path(config["cache"]["path"])
        
        if self.enabled:
            self.cache_dir.mkdir(exist_ok=True)
    
    def get(self, key: str) -> Optional[Dict]:
        """Get data from cache if it exists and is not expired"""
        if not self.enabled:
            return None
            
        cache_file = self.cache_dir / f"{key}.json"
        
        if not cache_file.exists():
            return None
            
        # Check if cache is expired
        modified_time = cache_file.stat().st_mtime
        if (time.time() - modified_time) > self.ttl:
            return None
            
        try:
            with open(cache_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return None
    
    def set(self, key: str, data: Dict) -> None:
        """Save data to cache"""
        if not self.enabled:
            return
            
        cache_file = self.cache_dir / f"{key}.json"
        
        with open(cache_file, "w") as f:
            json.dump(data, f)


class DataSource:
    """CSV data source implementation"""
    
    def __init__(self, config):
        self.path = config["data_source"]["path"]
    
    def read_dependencies(self) -> pd.DataFrame:
        """Read dependency data from CSV"""
        try:
            return pd.read_csv(self.path)
        except FileNotFoundError:
            logger.warning(f"CSV file not found at {self.path}, creating new dataset")
            return pd.DataFrame(columns=[
                "project", "ecosystem", "package_name", "version", 
                "license", "last_updated", "needs_update", "latest_version",
                "health_score", "abandonment_risk", "repository_url"
            ])
    
    def write_dependencies(self, data: pd.DataFrame) -> None:
        """Write dependency data back to CSV"""
        data.to_csv(self.path, index=False)
        logger.info(f"Updated dependency data written to {self.path}")


class NpmRegistry:
    """NPM registry API client"""
    
    def __init__(self, config: Dict, cache: Cache):
        self.registry_url = config["ecosystems"]["npm"]["registry_url"]
        self.cache = cache
    
    def get_package_info(self, package_name: str) -> Dict:
        """Get package information from npm registry"""
        cache_key = f"npm_{package_name}"
        cached_data = self.cache.get(cache_key)
        
        if cached_data:
            logger.debug(f"Using cached data for {package_name}")
            return cached_data
        
        try:
            url = f"{self.registry_url}{package_name}"
            response = requests.get(url)
            response.raise_for_status()
            
            npm_data = response.json()
            
            # Extract relevant information
            latest_version = npm_data.get("dist-tags", {}).get("latest", "unknown")
            last_published = npm_data.get("time", {}).get(latest_version)
            
            # Get repository URL
            repository_url = None
            if npm_data.get("repository"):
                if isinstance(npm_data["repository"], dict):
                    repository_url = npm_data["repository"].get("url")
                elif isinstance(npm_data["repository"], str):
                    repository_url = npm_data["repository"]
            
            result = {
                "name": npm_data.get("name"),
                "latestVersion": latest_version,
                "lastPublished": last_published,
                "repositoryUrl": repository_url,
                "maintainers": len(npm_data.get("maintainers", [])),
                "license": npm_data.get("license")
            }
            
            self.cache.set(cache_key, result)
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching NPM data for {package_name}: {e}")
            return {
                "name": package_name,
                "latestVersion": "unknown",
                "lastPublished": None,
                "repositoryUrl": None,
                "maintainers": 0,
                "license": "unknown"
            }


class PyPIRegistry:
    """PyPI registry API client"""
    
    def __init__(self, config: Dict, cache: Cache):
        self.registry_url = config["ecosystems"]["pypi"]["registry_url"]
        self.cache = cache
    
    def get_package_info(self, package_name: str) -> Dict:
        """Get package information from PyPI registry"""
        cache_key = f"pypi_{package_name}"
        cached_data = self.cache.get(cache_key)
        
        if cached_data:
            logger.debug(f"Using cached data for {package_name}")
            return cached_data
        
        try:
            url = f"{self.registry_url}{package_name}/json"
            response = requests.get(url)
            response.raise_for_status()
            
            pypi_data = response.json()
            
            # Extract relevant information
            latest_version = pypi_data.get("info", {}).get("version", "unknown")
            
            # PyPI doesn't provide last published time in the main response
            # We could approximate it from release history
            releases = pypi_data.get("releases", {})
            last_published = None
            if latest_version in releases and releases[latest_version]:
                upload_time = releases[latest_version][0].get("upload_time")
                if upload_time:
                    last_published = upload_time
            
            # Get repository URL
            project_urls = pypi_data.get("info", {}).get("project_urls")
            repository_url = None
            if project_urls:
                repository_url = (
                    project_urls.get("Source") or 
                    project_urls.get("Homepage") or 
                    pypi_data.get("info", {}).get("home_page")
                )
            else:
                repository_url = pypi_data.get("info", {}).get("home_page")
            
            result = {
                "name": pypi_data.get("info", {}).get("name"),
                "latestVersion": latest_version,
                "lastPublished": last_published,
                "repositoryUrl": repository_url,
                "maintainers": 1,  # PyPI doesn't expose maintainer count easily
                "license": pypi_data.get("info", {}).get("license", "unknown")
            }
            
            self.cache.set(cache_key, result)
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching PyPI data for {package_name}: {e}")
            return {
                "name": package_name,
                "latestVersion": "unknown",
                "lastPublished": None,
                "repositoryUrl": None,
                "maintainers": 0,
                "license": "unknown"
            }


class VulnerabilityScanner:
    """Vulnerability scanning using Open Source Vulnerabilities (OSV) database"""
    
    def __init__(self, config: Dict, cache: Cache):
        self.cache = cache
        self.enabled = config.get("security", {}).get("enabled", True)
        self.osv_api_url = config.get("security", {}).get("osv_api_url", "https://api.osv.dev/v1/query")
        self.cache_ttl = config.get("security", {}).get("cache_ttl", 86400)  # 1 day by default
    
    def check_vulnerabilities(self, ecosystem: str, package_name: str, version: str) -> List[Dict]:
        """Check for vulnerabilities in a package version using OSV"""
        if not self.enabled:
            return []
        
        # Normalize ecosystem name for OSV
        osv_ecosystem = self._normalize_ecosystem(ecosystem)
        if not osv_ecosystem:
            return []
            
        cache_key = f"vuln_{osv_ecosystem}_{package_name}_{version}"
        cached_data = self.cache.get(cache_key)
        
        if cached_data:
            logger.debug(f"Using cached vulnerability data for {package_name}@{version}")
            return cached_data
        
        try:
            # Prepare query for OSV API
            query = {
                "package": {
                    "name": package_name,
                    "ecosystem": osv_ecosystem
                },
                "version": version
            }
            
            # Send request to OSV API
            response = requests.post(self.osv_api_url, json=query)
            response.raise_for_status()
            
            data = response.json()
            vulnerabilities = data.get("vulns", [])
            
            # Enhance vulnerability data with severity information
            processed_vulns = []
            for vuln in vulnerabilities:
                processed_vuln = {
                    "id": vuln.get("id"),
                    "summary": vuln.get("summary"),
                    "details": vuln.get("details"),
                    "severity": self._extract_severity(vuln),
                    "published": vuln.get("published"),
                    "modified": vuln.get("modified"),
                    "references": [ref.get("url") for ref in vuln.get("references", [])],
                    "affected_versions": self._extract_affected_versions(vuln),
                    "fixed_versions": self._extract_fixed_versions(vuln)
                }
                processed_vulns.append(processed_vuln)
            
            self.cache.set(cache_key, processed_vulns)
            return processed_vulns
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching vulnerability data for {package_name}@{version}: {e}")
            return []
    
    def _normalize_ecosystem(self, ecosystem: str) -> str:
        """Normalize ecosystem name for OSV API"""
        ecosystem = ecosystem.lower()
        mapping = {
            "npm": "npm",
            "pypi": "PyPI",
            "python": "PyPI",
            "pip": "PyPI",
            "maven": "Maven",
            "nuget": "NuGet",
            "packagist": "Packagist",
            "composer": "Packagist",
            "rubygems": "RubyGems",
            "cargo": "crates.io",
            "rust": "crates.io",
            "go": "Go",
            "golang": "Go"
        }
        return mapping.get(ecosystem, "")
    
    def _extract_severity(self, vuln: Dict) -> str:
        """Extract severity information from vulnerability data"""
        # Try to get CVSS score
        for db_specific in vuln.get("database_specific", {}).values():
            if isinstance(db_specific, dict):
                # Look for severity in database_specific fields
                if "severity" in db_specific:
                    return db_specific["severity"]
                
                # Try to find CVSS score
                cvss = db_specific.get("cvss", {})
                if isinstance(cvss, dict) and "score" in cvss:
                    score = float(cvss["score"])
                    if score >= 9.0:
                        return "Critical"
                    elif score >= 7.0:
                        return "High"
                    elif score >= 4.0:
                        return "Medium"
                    else:
                        return "Low"
        
        # Default severity based on whether a fix is available
        if self._extract_fixed_versions(vuln):
            return "Medium"
        return "Unknown"
    
    def _extract_affected_versions(self, vuln: Dict) -> List[str]:
        """Extract affected version ranges from vulnerability data"""
        affected_versions = []
        for affected in vuln.get("affected", []):
            if affected.get("package", {}).get("name") != vuln.get("package", {}).get("name"):
                continue
                
            for version_range in affected.get("ranges", []):
                if version_range.get("type") == "SEMVER":
                    for event in version_range.get("events", []):
                        if "introduced" in event:
                            affected_versions.append(f">={event['introduced']}")
                        if "fixed" in event:
                            affected_versions.append(f"<{event['fixed']}")
        
        return affected_versions
    
    def _extract_fixed_versions(self, vuln: Dict) -> List[str]:
        """Extract fixed versions from vulnerability data"""
        fixed_versions = []
        for affected in vuln.get("affected", []):
            if affected.get("package", {}).get("name") != vuln.get("package", {}).get("name"):
                continue
                
            for version_range in affected.get("ranges", []):
                if version_range.get("type") == "SEMVER":
                    for event in version_range.get("events", []):
                        if "fixed" in event:
                            fixed_versions.append(event["fixed"])
        
        return fixed_versions
    
    def get_safe_upgrade_version(self, ecosystem: str, package_name: str, 
                                current_version: str, latest_version: str) -> Optional[str]:
        """Determine a safe version to upgrade to that fixes vulnerabilities"""
        if current_version == latest_version:
            return None
            
        # Check current version for vulnerabilities
        current_vulns = self.check_vulnerabilities(ecosystem, package_name, current_version)
        if not current_vulns:
            return None  # No vulnerabilities to fix
            
        # If there are vulnerabilities, check if latest version fixes them
        latest_vulns = self.check_vulnerabilities(ecosystem, package_name, latest_version)
        
        # If latest version has no vulnerabilities, recommend it
        if not latest_vulns:
            return latest_version
            
        # If latest version still has vulnerabilities, we need to check if they're the same ones
        current_vuln_ids = {v["id"] for v in current_vulns}
        latest_vuln_ids = {v["id"] for v in latest_vulns}
        
        # If latest version fixes some but not all vulnerabilities
        if len(latest_vuln_ids) < len(current_vuln_ids):
            return latest_version
            
        # Otherwise, no good recommendation available
        return None


class GitHubClient:
    """GitHub API client for repository information"""
    
    def __init__(self, config: Dict, cache: Cache):
        self.cache = cache
        self.token = os.environ.get("GITHUB_TOKEN") or config["github"].get("token")
        self.api_url = config["github"]["api_url"]
        self.enabled = config["github"]["enabled"]
        
        # Set up headers
        self.headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token and self.token != "${GITHUB_TOKEN}":
            self.headers["Authorization"] = f"token {self.token}"
    
    def extract_repo_info(self, repo_url: Optional[str]) -> Optional[Tuple[str, str]]:
        """Extract owner and repo name from GitHub URL"""
        if not repo_url:
            return None
            
        # Handle different URL formats
        patterns = [
            r"github\.com/([^/]+)/([^/]+)",
            r"github\.com:([^/]+)/([^/]+)",
            r"github\.com:([^/]+)/([^/.]+)"
        ]
        
        import re
        for pattern in patterns:
            match = re.search(pattern, repo_url)
            if match:
                return match.group(1), match.group(2).replace(".git", "")
                
        return None
    
    def get_repo_info(self, repo_url: Optional[str]) -> Dict:
        """Get repository information from GitHub"""
        if not self.enabled or not repo_url:
            return {}
            
        repo_info = self.extract_repo_info(repo_url)
        if not repo_info:
            return {}
            
        owner, repo = repo_info
        cache_key = f"github_{owner}_{repo}"
        cached_data = self.cache.get(cache_key)
        
        if cached_data:
            logger.debug(f"Using cached GitHub data for {owner}/{repo}")
            return cached_data
        
        try:
            # Get repository info
            repo_url = f"{self.api_url}repos/{owner}/{repo}"
            response = requests.get(repo_url, headers=self.headers)
            response.raise_for_status()
            
            repo_data = response.json()
            
            # Get commit activity (last year's weekly commit counts)
            commits_url = f"{self.api_url}repos/{owner}/{repo}/stats/commit_activity"
            commits_response = requests.get(commits_url, headers=self.headers)
            
            last_commit_date = None
            commit_frequency = 0
            
            if commits_response.status_code == 200:
                commits_data = commits_response.json()
                # Sum up the last 4 weeks of commits
                recent_commits = sum(week.get("total", 0) for week in commits_data[-4:]) if commits_data else 0
                commit_frequency = recent_commits / 4  # Average weekly commits
            
            # Get contributors count (just the first page)
            contributors_url = f"{self.api_url}repos/{owner}/{repo}/contributors"
            contributors_response = requests.get(contributors_url, headers=self.headers, params={"per_page": 1})
            
            contributors_count = 0
            if contributors_response.status_code == 200:
                # GitHub returns the total count in the Link header for pagination
                link_header = contributors_response.headers.get("Link", "")
                import re
                match = re.search(r'page=(\d+)>; rel="last"', link_header)
                if match:
                    contributors_count = int(match.group(1))
                else:
                    # If there's only one page, count the items
                    contributors_count = len(contributors_response.json())
            
            result = {
                "stars": repo_data.get("stargazers_count", 0),
                "forks": repo_data.get("forks_count", 0),
                "openIssues": repo_data.get("open_issues_count", 0),
                "commitFrequency": commit_frequency,
                "contributorsCount": contributors_count,
                "watchersCount": repo_data.get("subscribers_count", 0),
                "archived": repo_data.get("archived", False),
                "license": repo_data.get("license", {}).get("name"),
                "description": repo_data.get("description")
            }
            
            self.cache.set(cache_key, result)
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching GitHub data for {repo_url}: {e}")
            return {}


class HealthAnalyzer:
    """Analyzes the health of dependencies"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.metrics = config["health_metrics"]
    
    def calculate_health_score(self, package_info: Dict, repo_info: Dict) -> int:
        """Calculate a health score (0-100) for a dependency"""
        score = 0
        max_score = 100
        
        # Score based on update frequency
        if package_info.get("lastPublished"):
            try:
                from dateutil import parser
                last_published = parser.parse(package_info["lastPublished"])
                days_since_publish = (datetime.datetime.now(datetime.timezone.utc) - last_published).days
                
                weight = self.metrics["update_frequency"]["weight"]
                thresholds = self.metrics["update_frequency"]["thresholds"]
                
                if days_since_publish < thresholds[0]:
                    score += weight
                elif days_since_publish < thresholds[1]:
                    score += weight * 0.8
                elif days_since_publish < thresholds[2]:
                    score += weight * 0.6
                elif days_since_publish < thresholds[3]:
                    score += weight * 0.3
                else:
                    score += weight * 0.1
            except Exception:
                # If date parsing fails, give a low score for this metric
                score += self.metrics["update_frequency"]["weight"] * 0.1
        
        # Score based on GitHub metrics
        if repo_info:
            # Stars
            stars = repo_info.get("stars", 0)
            weight = self.metrics["stars"]["weight"]
            thresholds = self.metrics["stars"]["thresholds"]
            
            if stars >= thresholds[4]:
                score += weight
            elif stars >= thresholds[3]:
                score += weight * 0.8
            elif stars >= thresholds[2]:
                score += weight * 0.6
            elif stars >= thresholds[1]:
                score += weight * 0.4
            elif stars >= thresholds[0]:
                score += weight * 0.2
            
            # Forks
            forks = repo_info.get("forks", 0)
            weight = self.metrics["forks"]["weight"]
            thresholds = self.metrics["forks"]["thresholds"]
            
            if forks >= thresholds[4]:
                score += weight
            elif forks >= thresholds[3]:
                score += weight * 0.8
            elif forks >= thresholds[2]:
                score += weight * 0.6
            elif forks >= thresholds[1]:
                score += weight * 0.4
            elif forks >= thresholds[0]:
                score += weight * 0.2
            
            # Contributors
            contributors = repo_info.get("contributorsCount", 0)
            weight = self.metrics["contributors"]["weight"]
            thresholds = self.metrics["contributors"]["thresholds"]
            
            if contributors >= thresholds[4]:
                score += weight
            elif contributors >= thresholds[3]:
                score += weight * 0.8
            elif contributors >= thresholds[2]:
                score += weight * 0.6
            elif contributors >= thresholds[1]:
                score += weight * 0.4
            elif contributors >= thresholds[0]:
                score += weight * 0.2
            
            # Commit frequency (bonus)
            commit_freq = repo_info.get("commitFrequency", 0)
            if commit_freq > 10:  # More than 10 commits per week
                score += 5
            elif commit_freq > 5:  # More than 5 commits per week
                score += 3
            elif commit_freq > 1:  # More than 1 commit per week
                score += 1
            
            # Archived status (penalty)
            if repo_info.get("archived", False):
                score -= 20
        
        # Score based on maintainers
        maintainers = package_info.get("maintainers", 0)
        if maintainers > 5:
            score += 5
        elif maintainers > 2:
            score += 3
        elif maintainers > 0:
            score += 1
        
        return min(max(int(score), 0), max_score)
    
    def assess_abandonment_risk(self, package_info: Dict, repo_info: Dict) -> str:
        """Assess the risk of abandonment for a dependency"""
        # Default risk level
        risk = "Low"
        
        # Check for GitHub archive status
        if repo_info.get("archived", False):
            return "Critical"
        
        # Check last update time
        if package_info.get("lastPublished"):
            try:
                from dateutil import parser
                last_published = parser.parse(package_info["lastPublished"])
                days_since_publish = (datetime.datetime.now(datetime.timezone.utc) - last_published).days
                
                threshold = self.config["ecosystems"]["npm"].get("threshold_days", 180)
                if days_since_publish > threshold * 2:
                    risk = "High"
                elif days_since_publish > threshold:
                    risk = "Medium"
            except Exception:
                # If date parsing fails, assume medium risk
                risk = "Medium"
        else:
            # If no last published date available, consider it medium risk
            risk = "Medium"
        
        # Check GitHub activity
        if repo_info:
            # If commit frequency is very low
            if repo_info.get("commitFrequency", 0) < 0.25:  # Less than 1 commit per month
                if risk == "Low":
                    risk = "Medium"
                elif risk == "Medium":
                    risk = "High"
        
        return risk


class DependencyMonitor:
    """Main class for dependency monitoring"""
    
    def __init__(self, config_path: str = DEFAULT_CONFIG_PATH):
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Initialize components
        self.cache = Cache(self.config)
        self.data_source = DataSource(self.config)
        self.github_client = GitHubClient(self.config, self.cache)
        self.health_analyzer = HealthAnalyzer(self.config)
        self.vulnerability_scanner = VulnerabilityScanner(self.config, self.cache)
        
        # Initialize package registries
        self.registries = {}
        if self.config["ecosystems"]["npm"]["enabled"]:
            self.registries["npm"] = NpmRegistry(self.config, self.cache)
        if self.config["ecosystems"]["pypi"]["enabled"]:
            self.registries["pypi"] = PyPIRegistry(self.config, self.cache)
        
        # Initialize analysis status
        self.analyzing = False
        self.last_analysis_time = None
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from file"""
        try:
            with open(config_path, "r") as f:
                if config_path.endswith(".yaml") or config_path.endswith(".yml"):
                    config = yaml.safe_load(f)
                    logger.info(f"Loaded configuration from {config_path}")
                    return config
                else:
                    raise ValueError(f"Unsupported config format: {config_path}")
        except Exception as e:
            logger.error(f"Error loading configuration from {config_path}: {e}")
            logger.error("Please ensure the config file exists and is properly formatted.")
            sys.exit(1)
    
    def analyze_dependencies(self, background=False) -> Optional[pd.DataFrame]:
        """Analyze all dependencies and update health metrics"""
        if background:
            # Start analysis in a background thread
            if self.analyzing:
                logger.warning("Analysis already in progress, skipping request")
                return None
            
            self.analyzing = True
            thread = threading.Thread(target=self._analyze_dependencies_thread)
            thread.daemon = True
            thread.start()
            return None
        else:
            # Run analysis synchronously
            return self._analyze_dependencies()
    
    def _analyze_dependencies_thread(self):
        """Run the analysis in a background thread"""
        try:
            self._analyze_dependencies()
        finally:
            self.analyzing = False
            self.last_analysis_time = datetime.datetime.now()
    
    def _analyze_dependencies(self) -> pd.DataFrame:
        """Perform the actual dependency analysis"""
        # Read current dependency data
        df = self.data_source.read_dependencies()
        
        if df.empty:
            logger.warning("No dependencies found in data source")
            return df
        
        # Create output directory if it doesn't exist
        output_dir = Path(self.config["output"]["report_dir"])
        output_dir.mkdir(exist_ok=True)
        
        # Process each dependency
        results = []
        for _, row in df.iterrows():
            ecosystem = row.get("ecosystem")
            package_name = row.get("package_name")
            current_version = row.get("version")
            
            if not package_name or not ecosystem:
                logger.warning(f"Skipping row with missing package name or ecosystem: {row}")
                results.append(row.to_dict())
                continue
            
            logger.info(f"Analyzing {ecosystem} package: {package_name}")
            
            # Get package information from registry
            registry = self.registries.get(ecosystem)
            if not registry:
                logger.warning(f"No registry configured for ecosystem: {ecosystem}")
                results.append(row.to_dict())
                continue
            
            package_info = registry.get_package_info(package_name)
            
            # Get repository information from GitHub
            repo_url = package_info.get("repositoryUrl")
            repo_info = self.github_client.get_repo_info(repo_url)

            # Check for vulnerabilities first
            vulnerabilities = self.vulnerability_scanner.check_vulnerabilities(
                ecosystem, package_name, current_version
            )
            has_vulnerabilities = len(vulnerabilities) > 0
            vulnerability_details = []
            highest_severity = "None"
            severities = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1, "Unknown": 0, "None": -1}

            if has_vulnerabilities:
                current_max_severity_level = -1
                for vuln in vulnerabilities:
                    severity = vuln.get("severity", "Unknown")
                    vulnerability_details.append({
                        "id": vuln.get("id"),
                        "summary": vuln.get("summary"),
                        "severity": severity,
                        "references": vuln.get("references", []),
                        "fixed_versions": vuln.get("fixed_versions", [])
                    })
                    # Track highest severity
                    severity_level = severities.get(severity, 0)
                    if severity_level > current_max_severity_level:
                        highest_severity = severity
                        current_max_severity_level = severity_level

            # Calculate health metrics, passing vulnerability info
            health_score = self.health_analyzer.calculate_health_score(package_info, repo_info, highest_severity)
            abandonment_risk = self.health_analyzer.assess_abandonment_risk(package_info, repo_info)

            # Get safe upgrade version if vulnerabilities exist
            safe_version = None
            # Prepare updated row data
            updated_row = row.to_dict().copy() if isinstance(row, pd.Series) else row.copy()
            updated_row.update({
                "latest_version": package_info.get("latestVersion"),
                "needs_update": package_info.get("latestVersion") != current_version,
                "last_updated": package_info.get("lastPublished"),
                "health_score": health_score,
                "abandonment_risk": abandonment_risk,
                "repository_url": repo_url,
                "license": package_info.get("license") or updated_row.get("license"),
                "has_vulnerabilities": has_vulnerabilities,
                "vulnerability_count": len(vulnerabilities),
                "vulnerability_details": vulnerability_details,
                "safe_upgrade_version": safe_version
            })
            
            results.append(updated_row)
        
        # Create updated DataFrame
        updated_df = pd.DataFrame(results)
        
        # Write back to data source
        self.data_source.write_dependencies(updated_df)
        
        # Generate reports
        self._generate_reports(updated_df)
        
        # Save as JSON for web dashboard
        self._save_json_for_dashboard(updated_df)
        
        return updated_df
    
    def _save_json_for_dashboard(self, df: pd.DataFrame) -> None:
        """Save dependency data as JSON for the dashboard"""
        output_dir = Path(self.config["output"]["report_dir"])
        output_file = output_dir / "dependencies.json"
        
        df.to_json(output_file, orient="records", indent=2)
        logger.info(f"Saved dependency data as JSON to {output_file}")
    
    def _generate_reports(self, df: pd.DataFrame) -> None:
        """Generate dependency health reports"""
        output_dir = Path(self.config["output"]["report_dir"])
        report_format = self.config["output"]["report_format"]
        
        # Generate overall report
        all_deps = len(df)
        high_risk_deps = len(df[df["abandonment_risk"].isin(["High", "Critical"])])
        outdated_deps = len(df[df["needs_update"] == True])
        healthy_deps = len(df[(df["abandonment_risk"] == "Low") & (df["needs_update"] == False) & (df["health_score"] > 70)])
        
        # Count vulnerabilities
        vulnerable_deps = 0
        critical_vulns = 0
        high_vulns = 0
        
        for _, row in df.iterrows():
            if row.get("has_vulnerabilities", False):
                vulnerable_deps += 1
                if "vulnerability_details" in row:
                    for vuln in row["vulnerability_details"]:
                        if vuln.get("severity") == "Critical":
                            critical_vulns += 1
                        elif vuln.get("severity") == "High":
                            high_vulns += 1
        
        if report_format == "markdown":
            # Create overall report
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            report_content = f"""# Dependency Health Report
Generated on {timestamp}

## Summary
- Total Dependencies: {all_deps}
- Dependencies Needing Updates: {outdated_deps}
- Dependencies at High/Critical Risk: {high_risk_deps}
- Dependencies with Vulnerabilities: {vulnerable_deps}
- Healthy Dependencies: {healthy_deps}

## Security Vulnerabilities
"""
            # Add vulnerable dependencies if they exist
            if vulnerable_deps > 0:
                report_content += f"Found {vulnerable_deps} dependencies with security vulnerabilities:\n"
                
                vulnerable_df = df[df.get("has_vulnerabilities", False) == True]
                for _, row in vulnerable_df.iterrows():
                    vuln_count = row.get("vulnerability_count", 0)
                    report_content += f"- **{row['package_name']}** ({row['version']}): {vuln_count} vulnerabilities"
                    
                    if row.get("safe_upgrade_version"):
                        report_content += f", recommend upgrading to v{row['safe_upgrade_version']}"
                    
                    report_content += "\n"
                    
                    # Add vulnerability details if available
                    if "vulnerability_details" in row and row["vulnerability_details"]:
                        for i, vuln in enumerate(row["vulnerability_details"]):
                            severity = vuln.get("severity", "Unknown")
                            severity_marker = "🔴" if severity in ["Critical", "High"] else "🟠" if severity == "Medium" else "🟡"
                            
                            report_content += f"  {severity_marker} {severity}: {vuln.get('summary')}\n"
                            
                            # Add reference link to first vulnerability only to keep the report clean
                            if i == 0 and vuln.get("references") and len(vuln["references"]) > 0:
                                report_content += f"    [More details]({vuln['references'][0]})\n"
            else:
                report_content += "No security vulnerabilities detected!\n"

            report_content += "\n## High Risk Dependencies\n"
            
            # Add high risk dependencies
            high_risk_df = df[df["abandonment_risk"].isin(["High", "Critical"])]
            if not high_risk_df.empty:
                for _, row in high_risk_df.iterrows():
                    report_content += f"- **{row['package_name']}** ({row['version']}): {row['abandonment_risk']} risk, Health Score: {row['health_score']}\n"
            else:
                report_content += "No dependencies at high risk!\n"
            
            report_content += "\n## Update Needed\n"
            
            # Add outdated dependencies
            outdated_df = df[df["needs_update"] == True]
            if not outdated_df.empty:
                for _, row in outdated_df.iterrows():
                    report_content += f"- **{row['package_name']}**: Current {row['version']} → Latest {row['latest_version']}\n"
            else:
                report_content += "All dependencies are up to date!\n"
            
            report_content += "\n## Recommendations\n"
            
            if vulnerable_deps > 0:
                report_content += "- 🔴 **URGENT**: Update dependencies with security vulnerabilities\n"
            if high_risk_deps > 0:
                report_content += "- Consider finding alternatives for high-risk dependencies\n"
            if outdated_deps > 0:
                report_content += "- Schedule time to update outdated dependencies\n"
            report_content += "- Review dependencies with health scores below 50\n"
            report_content += "- Consider implementing automated dependency updates with tools like Dependabot\n"
            
            # Write report to file
            with open(output_dir / "dependency_report.md", "w") as f:
                f.write(report_content)
                
            logger.info(f"Generated markdown report at {output_dir}/dependency_report.md")
        
        # Generate per-project reports
        projects = df["project"].unique()
        for project in projects:
            project_df = df[df["project"] == project]
            project_name = project.replace(" ", "_").lower()
            
            if report_format == "markdown":
                # Create project report
                timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                report_content = f"""# Dependency Health Report: {project}
Generated on {timestamp}

## Summary
- Total Dependencies: {len(project_df)}
- Dependencies Needing Updates: {len(project_df[project_df["needs_update"] == True])}
- Dependencies at High/Critical Risk: {len(project_df[project_df["abandonment_risk"].isin(["High", "Critical"])])}
- Healthy Dependencies: {len(project_df[(project_df["abandonment_risk"] == "Low") & (project_df["needs_update"] == False) & (project_df["health_score"] > 70)])}

## All Dependencies

| Package | Version | Latest | Health Score | Risk Level | License |
|---------|---------|--------|--------------|------------|---------|
"""
                # Add all dependencies to table
                for _, row in project_df.iterrows():
                    report_content += f"| {row['package_name']} | {row['version']} | {row['latest_version']} | {row['health_score']} | {row['abandonment_risk']} | {row['license']} |\n"
                
                # Write report to file
                with open(output_dir / f"{project_name}_report.md", "w") as f:
                    f.write(report_content)
                    
                logger.info(f"Generated project report at {output_dir}/{project_name}_report.md")

    def get_status(self):
        """Get the current status of the monitor"""
        return {
            "analyzing": self.analyzing,
            "last_analysis_time": self.last_analysis_time.isoformat() if self.last_analysis_time else None
        }


# Configure Flask routes

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/details.html')
def details():
    return app.send_static_file('details.html')

@app.route('/reports/<path:filename>')
def reports(filename):
    reports_dir = Path(monitor.config["output"]["report_dir"])
    return send_from_directory(reports_dir, filename)

@app.route('/api/status')
def api_status():
    return jsonify(monitor.get_status())

@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    if request.args.get('background', 'true').lower() == 'true':
        monitor.analyze_dependencies(background=True)
        return jsonify({"status": "Analysis started in background"})
    else:
        monitor.analyze_dependencies(background=False)
        return jsonify({"status": "Analysis completed"})

@app.route('/api/dependencies')
def api_dependencies():
    df = monitor.data_source.read_dependencies()
    return jsonify(json.loads(df.to_json(orient="records")))

def open_browser(port):
    """Open the browser after a short delay to ensure server is running"""
    time.sleep(1.5)
    url = f"http://localhost:{port}"
    webbrowser.open(url)

def main():
    """Main entry point for the application"""
    parser = argparse.ArgumentParser(description="Dependency Health Monitor")
    parser.add_argument(
        "--config", 
        default=DEFAULT_CONFIG_PATH,
        help=f"Path to configuration file (default: {DEFAULT_CONFIG_PATH})"
    )
    parser.add_argument(
        "--port", 
        type=int,
        help="Port to run the web dashboard on (overrides config)"
    )
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Analyze dependencies on startup"
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Don't open browser automatically"
    )
    args = parser.parse_args()
    
    # Check if config file exists
    if not os.path.exists(args.config):
        logger.error(f"Config file not found: {args.config}")
        sys.exit(1)
    
    # Initialize the global monitor instance
    global monitor
    monitor = DependencyMonitor(args.config)
    
    # Get port from command line or config
    port = args.port if args.port else monitor.config["output"].get("dashboard_port", 8080)
    
    # Run analysis if requested
    if args.analyze:
        logger.info("Running initial dependency analysis...")
        monitor.analyze_dependencies()
    
    # Start browser in a separate thread if enabled
    if not args.no_browser and monitor.config["output"].get("dashboard", True):
        browser_thread = threading.Thread(target=open_browser, args=(port,))
        browser_thread.daemon = True
        browser_thread.start()
    
    # Run the Flask app
    logger.info(f"Starting web dashboard at http://localhost:{port}")
    app.run(host="0.0.0.0", port=8000, debug=False)


if __name__ == "__main__":
    main()