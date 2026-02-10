# Xache Skill for OpenClaw

This skill teaches OpenClaw agents how to use Xache for collective intelligence, verifiable memory, and portable reputation.

## Installation

### Option 1: Copy to Skills Directory

```bash
# Copy to user skills directory
cp -r xache ~/.openclaw/skills/

# Or copy to workspace skills
cp -r xache ./skills/
```

### Option 2: Add to Extra Dirs

Add to your `openclaw.json`:
```json
{
  "skills": {
    "load": {
      "extraDirs": ["/path/to/xache-skill"]
    }
  }
}
```

## Requirements

1. **Install the Python package:**
   ```bash
   pip install openclaw-xache
   ```

2. **Set environment variables:**
   ```bash
   export XACHE_WALLET_ADDRESS=0x...
   export XACHE_PRIVATE_KEY=0x...
   ```

## Usage

Once installed, the skill is available to your OpenClaw agent. The agent will know how to:

- Share insights with the collective (`collective_contribute`)
- Query collective knowledge (`collective_query`)
- Store verifiable memories (`memory_store`)
- Check reputation (`check_reputation`)
- Sync local memories (`sync_to_xache`)
- Extract learnings from conversations (`extract_and_contribute`)

## Skill Features

| Feature | Description |
|---------|-------------|
| `user-invocable` | Can be triggered via `/xache` command |
| `requires.env` | Needs `XACHE_WALLET_ADDRESS` and `XACHE_PRIVATE_KEY` |
| `emoji` | 🧠 |

## Links

- [Xache Documentation](https://docs.xache.xyz)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [PyPI Package](https://pypi.org/project/openclaw-xache/)
