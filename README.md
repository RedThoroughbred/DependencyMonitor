# Dependency Monitor

A comprehensive tool for tracking the health, security, and status of dependencies across multiple projects and package ecosystems.

## Features

- **Multi-Ecosystem Support**: Monitor both npm and PyPI packages
- **Health Scoring**: Advanced algorithm to calculate dependency health scores based on multiple factors
- **Risk Assessment**: Identify dependencies at risk of abandonment
- **Vulnerability Scanning**: Detect security vulnerabilities in dependencies (via OSV database)
- **Update Tracking**: Identify outdated dependencies and recommend upgrades
- **Interactive Dashboard**: Web interface for exploring dependencies and their health metrics
- **Dark Mode Support**: Toggle between light and dark themes
- **Reporting**: Generate markdown reports for overall dependency health

## Screenshots

![Dashboard](https://path-to-screenshot.png)
<!-- Add screenshots of your application here -->

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dependency-monitor.git
cd dependency-monitor
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up GitHub token for accessing GitHub API (optional but recommended):
```bash
export GITHUB_TOKEN=your_github_token
```

## Usage

### Running the dashboard:

```bash
python NewApp.py
```

The dashboard will be available at http://localhost:8000

### Running with analysis on startup:

```bash
python NewApp.py --analyze
```

### Command-line options:

```
usage: NewApp.py [-h] [--config CONFIG] [--port PORT] [--analyze] [--no-browser]

Dependency Health Monitor

optional arguments:
  -h, --help       show this help message and exit
  --config CONFIG  Path to configuration file (default: config/config.yaml)
  --port PORT      Port to run the web dashboard on (overrides config)
  --analyze        Analyze dependencies on startup
  --no-browser     Don't open browser automatically
```

## Configuration

Configuration is stored in `config/config.yaml`. Key options include:

- **data_source**: Configure where dependency data is stored
- **output**: Configure report format and dashboard settings
- **ecosystems**: Settings for npm and PyPI
- **security**: Vulnerability scanning settings
- **health_metrics**: Weights and thresholds for health score calculation

Example configuration:
```yaml
data_source:
  type: csv
  path: data/dependencies.csv

output:
  report_dir: reports
  report_format: markdown
  dashboard: true
  dashboard_port: 8080
```

## Health Score Algorithm

The health score (0-100) is calculated based on multiple factors:

- **Update Frequency**: How recently the package was updated
- **GitHub Metrics**: Stars, forks, contributors, and commit frequency
- **Ecosystem Recognition**: Popular packages get additional points
- **Update Status**: Up-to-date packages receive bonus points

Baseline scores ensure that recently updated packages receive an appropriate minimum score regardless of other factors.

## Risk Assessment

Risk levels (Low, Medium, High, Critical) are determined by:

- Time since last update
- GitHub repository archived status
- Commit frequency
- Security vulnerabilities

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenSourceVulnerabilities (OSV) for vulnerability data
- GitHub API for repository metrics
