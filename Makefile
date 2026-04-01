bin/stt: src/stt/*.js src/stt/*.json
	node --build-sea src/stt/sea.json

all: bin/stt

slop:
	bin/slop