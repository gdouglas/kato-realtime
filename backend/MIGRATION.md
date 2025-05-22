# Migration Guide: From requirements.txt to pyproject.toml with UV

This project has migrated from using `requirements.txt` with pip to using `pyproject.toml` with UV for dependency management.

## Why This Change?

1. **Modern Python Packaging**: `pyproject.toml` is the modern standard for Python package configuration.
2. **Single Source of Truth**: Dependencies are defined in one place.
3. **Better Dependency Resolution**: UV provides faster and more reliable dependency resolution.
4. **Development Dependencies**: Easier management of optional development dependencies.
5. **Standardized Build Process**: Better integration with Python packaging ecosystem.

## How To Use

### Installing Dependencies

Instead of:
```
pip install -r requirements.txt
```

Use:
```
uv sync
```

For development dependencies:
```
uv add --dev pytest pytest-asyncio
```

### Adding New Dependencies

Instead of adding to `requirements.txt`, use UV's command line:

```
uv add package-name
```

This will automatically update the `dependencies` list in `pyproject.toml`:

```toml
[project]
dependencies = [
    "existing-package>=1.0.0",
    "new-package>=2.0.0",  # Added by UV
]
```

### Adding Development Dependencies

Use UV's command line with the `--dev` flag:

```
uv add --dev pytest
```

This will update the `dev` section in `project.optional-dependencies`:

```toml
[project.optional-dependencies]
dev = [
    "existing-dev-package>=1.0.0",
    "pytest>=7.0.0",  # Added by UV
]
```

### Removing Dependencies

```
uv remove package-name
```

### Updating Dependencies

To update all dependencies:
```
uv lock --upgrade
```

To update a specific package:
```
uv lock --upgrade-package package-name
```

## Benefits of UV

- **Speed**: UV is significantly faster than pip for dependency resolution and installation.
- **Reliability**: Better handling of dependency conflicts.
- **Reproducibility**: Improved consistency across environments with lockfiles.
- **Modern Tooling**: Native integration with pyproject.toml.

## Common UV Commands

```bash
# Create virtual environment
uv venv

# Install all dependencies from pyproject.toml
uv sync

# Add a new dependency
uv add fastapi

# Add a development dependency
uv add --dev pytest

# Remove a dependency
uv remove fastapi

# Update the lockfile
uv lock

# Run a command in the context of the project
uv run pytest

# Run a Python script in the project environment
uv run my_script.py
``` 