# Instrumented Crutches Documentation

This directory contains the complete HTML documentation for the Instrumented Crutches system, automatically generated for deployment via GitHub Pages.

Documentation will be available at: `https://mmtlab.github.io/instrumented_crutches_mads/`

## Local Development

To view documentation locally during development:

```bash
cd docs
python -m http.server 8080
# Visit http://localhost:8080 in your browser
```


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

### Adding New Pages

1. Create new HTML file in `docs/`
2. Copy header/nav structure from existing page
3. Add link to nav bar in all pages
4. Update `.active` class on new page's nav link

## Version

- **Last Updated:** March 2026
- **Built for:** MADS 2.0.0+
- **Target Platform:** Raspberry Pi Zero 2 W

---

