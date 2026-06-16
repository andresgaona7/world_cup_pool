.PHONY: build-pool-data build-consensus-predictions update-official-results test

build-pool-data:
	python3 scripts/build_pool_data.py

build-consensus-predictions:
	python3 scripts/build_consensus_predictions.py

update-official-results:
	python3 scripts/update_official_results.py --transport "$${OFFICIAL_RESULTS_TRANSPORT:-auto}"

test:
	python3 -m unittest discover -s tests
