.PHONY: build-pool-data build-consensus-predictions update-official-results create-official-checkpoint rebuild-official-checkpoints test

build-pool-data:
	python3 scripts/build_pool_data.py

build-consensus-predictions:
	python3 scripts/build_consensus_predictions.py

update-official-results:
	python3 scripts/update_official_results.py --transport "$${OFFICIAL_RESULTS_TRANSPORT:-auto}"

create-official-checkpoint:
	python3 scripts/create_official_checkpoint.py "$${CHECKPOINT:?Set CHECKPOINT=group_md1}"

rebuild-official-checkpoints:
	python3 scripts/create_official_checkpoint.py --rebuild-only

test:
	python3 -m unittest discover -s tests
