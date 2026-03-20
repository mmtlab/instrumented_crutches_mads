# Instrumented Crutches Documentation

This directory contains the complete HTML documentation for the Instrumented Crutches system, automatically generated for deployment via GitHub Pages.

## Quick Access

- **[HTML Documentation](https://mmtlab.github.io/instrumented_crutches_mads/)** - Browse online
- **[Home](index.html)** - Start here
- **[Installation](installation.html)** - Setup instructions
- **[Usage Manual](usage.html)** - Day-to-day operation
- **[Configuration](configuration.html)** - Settings and calibration

## Local Development

To view documentation locally during development:

### Option 1: Simple HTTP Server

```bash
cd docs
python3 -m http.server 8080
# Visit http://localhost:8080 in your browser
```

### Option 2: Live Server (VS Code)

1. Install Live Server extension
2. Right-click on index.html
3. Select "Open with Live Server"

## File Structure

```
docs/
├── index.html              # Landing page
├── overview.html           # Project overview
├── installation.html       # Installation guide
├── usage.html             # Operating manual
├── architecture.html      # System design
├── configuration.html     # Settings reference
├── troubleshooting.html   # Problem solving
├── style.css             # Unified styling
└── .nojekyll             # Disable Jekyll processing
```

## Styling

All pages use the consistent stylesheet (`style.css`) which mirrors the design of the web_server interface:

- **Primary Color:** `#36579b` (Blue)
- **Background:** `#36579b` (Blue)
- **Panel Background:** `#ffffff` (White)
- **Text:** `#0f172a` (Dark)

## Navigation

All pages include:
- Persistent header with project title
- Sticky navigation bar with auto-highlighting
- Table of contents (TOC) for easy navigation
- Responsive design (mobile-friendly)
- Footer with copyright

## GitHub Pages Deployment

This documentation is served automatically via GitHub Pages when pushed to the `docs/` folder:

1. Repository must be public or Pages access enabled
2. Set GitHub Pages source to `docs` folder (in Settings)
3. Documentation will be available at: `https://mmtlab.github.io/instrumented_crutches_mads/`

## Maintaining Documentation

When updating documentation:

1. Edit HTML files in `docs/`
2. Keep styling consistent with `style.css`
3. Test locally with a simple HTTP server
4. Commit and push to GitHub
5. Changes appear online within 1 minute

### Adding New Pages

1. Create new HTML file in `docs/`
2. Copy header/nav structure from existing page
3. Add link to nav bar in all pages
4. Update `.active` class on new page's nav link

## Version

- **Last Updated:** March 2026
- **Built for:** MADS 2.0.0+
- **Target Platform:** Raspberry Pi Zero 2 W

## Support

For documentation issues or improvements:
- Open GitHub issue with "docs:" prefix
- Submit pull request with improvements
- Review troubleshooting guide for common problems

---

**Instrumented Crutches Project** - Real-time biomechanical data acquisition system
