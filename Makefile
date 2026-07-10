.PHONY: build-pool-data build-knockout-predictions build-consensus-predictions build-round-of-32-consensus build-round-of-16-consensus build-quarterfinal-consensus update-official-results update-official-knockout-results apply-manual-futures create-official-checkpoint rebuild-official-checkpoints build-site test

build-pool-data:
	python3 scripts/build_pool_data.py

build-knockout-predictions:
	python3 scripts/build_knockout_predictions.py

build-consensus-predictions:
	python3 scripts/build_consensus_predictions.py

build-round-of-32-consensus:
	python3 scripts/build_round_of_32_consensus.py

build-round-of-16-consensus:
	python3 scripts/build_round_of_16_consensus.py

build-quarterfinal-consensus:
	python3 scripts/build_quarterfinal_consensus.py

update-official-results:
	python3 scripts/update_official_results.py --transport "$${OFFICIAL_RESULTS_TRANSPORT:-auto}"

update-official-knockout-results:
	python3 scripts/update_official_knockout_results.py

apply-manual-futures:
	python3 scripts/apply_manual_futures.py

create-official-checkpoint:
	python3 scripts/create_official_checkpoint.py "$${CHECKPOINT:?Set CHECKPOINT=group_md1}"

rebuild-official-checkpoints:
	python3 scripts/create_official_checkpoint.py --rebuild-only

build-site:
	rm -rf public
	mkdir -p public/data/generated
	cp index.html styles.css theme.js .nojekyll public/
	cp -R apps public/
	cp -R static public/
	cp data/generated/consensus_predictions.json data/generated/knockout_predictions.js data/generated/official_results.js data/generated/pool_data.js data/generated/round_of_32_consensus.json data/generated/round_of_16_consensus.json data/generated/quarterfinal_consensus.json public/data/generated/

test:
	python3 -m unittest discover -s tests
