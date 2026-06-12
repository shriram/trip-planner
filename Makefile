.PHONY: help serve stop build test tui

# No default action: `make` with no target prints this menu. `tui` is listed
# first as the recommended way to run the planner.
.DEFAULT_GOAL := help
help:
	@echo "Trip Planner — make targets:"
	@echo ""
	@echo "  tui     ▶ run the terminal UI            (make tui [FILE=Trips/x.json])"
	@echo "  serve     run the web UI in a browser"
	@echo "  stop      stop the web server"
	@echo "  build     build the web bundle"
	@echo "  test      run the test suite"
	@echo ""
	@echo "Run a target with:  make <target>"

PORT_FILE := .server-port
PID_FILE := .server-pid

serve: build
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Server already running on port $$(cat $(PORT_FILE))"; \
		exit 1; \
	fi
	@PORT=$$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()'); \
	echo $$PORT > $(PORT_FILE); \
	npx serve . -l $$PORT & echo $$! > $(PID_FILE); \
	sleep 1; \
	open http://localhost:$$PORT

stop:
	@if [ -f $(PID_FILE) ]; then \
		kill $$(cat $(PID_FILE)) 2>/dev/null || true; \
		rm -f $(PID_FILE) $(PORT_FILE); \
		echo "Server stopped"; \
	else \
		echo "No server running"; \
	fi

build:
	npm run build

# Build and launch the terminal UI. Pass a file with: make tui FILE=Trips/x.json
tui:
	npm run build:tui
	node dist/tui.js $(FILE)

test:
	npm test
