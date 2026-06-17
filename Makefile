.PHONY: build-pool-data build-consensus-predictions update-official-results apply-manual-futures create-official-checkpoint rebuild-official-checkpoints build-site test

build-pool-data:
	python3 scripts/build_pool_data.py

build-consensus-predictions:
	python3 scripts/build_consensus_predictions.py

update-official-results:
	python3 scripts/update_official_results.py --transport "$${OFFICIAL_RESULTS_TRANSPORT:-auto}"

apply-manual-futures:
	python3 scripts/apply_manual_futures.py

create-official-checkpoint:
	python3 scripts/create_official_checkpoint.py "$${CHECKPOINT:?Set CHECKPOINT=group_md1}"

rebuild-official-checkpoints:
	python3 scripts/create_official_checkpoint.py --rebuild-only

build-site:
	rm -rf public
	mkdir -p public/data/generated public/data/manual
	cp index.html styles.css .nojekyll public/
	cp -R apps public/
	cp data/generated/consensus_predictions.json data/generated/official_results.js data/generated/pool_data.js public/data/generated/
	cp data/manual/knockout_predictions.js public/data/manual/

test:
	python3 -m unittest discover -s tests
