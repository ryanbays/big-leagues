# Justfile Quick Reference

This project uses **Just** instead of Make for command management.

## Installation

Just is a command runner similar to Make but with better syntax.

### Install Just

```bash
# Using cargo (Rust)
cargo install just

# Using homebrew (macOS)
brew install just

# Using apt (Debian/Ubuntu)
sudo apt install just

# Using pacman (Arch)
sudo pacman -S just

# Using pkg (Fedora)
sudo dnf install just

# From source: https://github.com/casey/just
```

## Usage

List all commands:
```bash
just
just --list
just help
```

Run a command:
```bash
just damru-setup
just damru-health
just damru-logs
```

## Common Commands

### Setup
```bash
just damru-setup      # Full setup with checks
just damru-quick      # Quick setup (fast)
just setup-all        # Full setup + start + health check
```

### Monitoring
```bash
just damru-status     # Show current status
just damru-watch      # Auto-refresh status
just damru-logs       # Show logs
just damru-logs-f     # Follow logs (streaming)
just damru-health     # Health check
```

### Management
```bash
just up               # Start services
just down             # Stop services
just restart          # Restart services
just damru-restart    # Restart Damru only
just damru-logs-f     # Follow Damru logs
```

### Cleanup
```bash
just damru-clean      # Stop and remove containers
just damru-clean-all  # Remove containers + volumes + images
```

### Testing
```bash
just damru-test       # Test all API endpoints
just damru-devices    # List available device profiles
just test-navigate    # Test navigate endpoint
just test-screenshot  # Test screenshot endpoint
```

### Utilities
```bash
just info             # Show setup information
just versions         # Show installed versions
just images           # List Damru Docker images
just volumes          # List Damru Docker volumes
just disk-usage       # Show disk usage
```

## Development

Development mode with auto-refreshing logs:
```bash
just dev              # Start services + follow logs
just dev-watch        # Watch status (auto-refresh)
```

## Differences from Makefile

| Feature | Makefile | Just |
|---------|----------|------|
| **Syntax** | Shell-like | More intuitive |
| **Comments** | `#` | `#` (same) |
| **Variables** | `VAR := value` | `VAR := "value"` |
| **Recipes** | `target:` | `recipe:` |
| **Dependencies** | `target: dep1 dep2` | `recipe: dep1 dep2` |
| **Special vars** | `$@, $<, $^` | No special vars needed |
| **Shebang** | `#!/bin/bash` at start | `#!` shebang per recipe |
| **Default** | `.PHONY: default` | `default:` first recipe |
| **Help** | No built-in | `just --list` | 

## Advantages of Just

- ✅ **Simpler syntax** - No special variables like `$@, $<`
- ✅ **Better defaults** - No `.PHONY` needed
- ✅ **Safer** - Uses `set -e` by default
- ✅ **Cross-platform** - Works on Linux, macOS, Windows
- ✅ **Embedded help** - `just --list` shows all commands
- ✅ **Variables** - Simpler string handling with `"value"`
- ✅ **Comments** - Each recipe is self-documenting

## Example Commands

View the justfile for all available commands:
```bash
cat justfile
```

Each command has a comment explaining what it does.

## Quick Start

1. **Install Just**
   ```bash
   cargo install just
   ```

2. **See available commands**
   ```bash
   just
   ```

3. **Run setup**
   ```bash
   just damru-setup
   ```

4. **Check health**
   ```bash
   just damru-health
   ```

5. **Watch status**
   ```bash
   just damru-watch
   ```

## Tips

- Use tab completion: `just <TAB>` (if your shell supports it)
- Combine commands: `just damru-setup && just damru-health`
- Run multiple recipes: `just up logs` (starts up then follows logs)
- Use `--dry-run` to preview: `just --dry-run damru-setup`

## Documentation

- **Just Guide**: https://github.com/casey/just
- **Just Examples**: https://github.com/casey/just/tree/master/examples
- **Local docs**: Read the justfile comments for each recipe

## Troubleshooting

### "just: command not found"

Install Just first:
```bash
cargo install just
```

Or check if it's in PATH:
```bash
which just
```

### Help text cut off

Use a pager:
```bash
just --list | less
just | less
```

### Commands not running

Make sure you're in the project directory:
```bash
cd /path/to/big-leagues-bot
just damru-setup
```

## Next Steps

1. Run: `just damru-setup`
2. Check: `just damru-health`
3. Use: `just help` for all commands

Enjoy! 🚀
