#!/bin/bash

echo "$(date): Starting fantasy-log simulation with auto-restart..."

while true; do
    echo "$(date): Launching process..."
    if command -v bun >/dev/null 2>&1; then
        echo "$(date): Using bun..."
        bun run dist/fantasy-log.js
    elif command -v node >/dev/null 2>&1; then
        echo "$(date): Using node..."
        node dist/fantasy-log-node.js
    else
        echo "$(date): ERROR: Neither bun nor node found!"
        exit 1
    fi

    EXIT_CODE=$?
    echo "$(date): Process exited with code $EXIT_CODE"

    if [ $EXIT_CODE -eq 0 ]; then
        echo "$(date): Clean exit detected. Not restarting."
        break
    else
        echo "$(date): Crash detected. Restarting in 5 seconds..."
        sleep 5
    fi
done

echo "$(date): Simulation monitoring ended."
