bin/stt: src/stt/*.js src/stt/*.json
	src/stt/node_modules/.bin/esbuild src/stt/stt.js --bundle --outfile=src/stt/stt_bundle.js \
	  --platform=node --format=cjs --target=node25
	node --build-sea src/stt/sea.json
	rm src/stt/stt_bundle.js

all: bin/stt

slop:
	bin/slop