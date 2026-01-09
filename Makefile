.PHONY: serve stop build test

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

test:
	npm test
