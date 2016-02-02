# Start-up
* Check for any outstanding commits to process - do not begin consuming yet
* Process outstanding commits, grouping (ordering?) them by aggregate ID (using the "Process" subroutine)
* Start consuming messages (using the Process subroutine)

# Process (group of commits)
* Obtain commits from wherever
* Load projection state, including version
	* Can load partial state if full state not required (e.g. embedded collections in objects)
* Apply handlers for all commits that it is possible to do so, leave the rest for later
* Save projection state
	* In case of success:
		* Save unprocessed commits to outstanding "queue"
		* Acknowledge both processed and unprocessed (these have been moved to the internal staging area)
	* In case of concurrency exception or other errors:
		* Reject batch

# Issues
* Is the start-up phase necessary? Perhaps we could just consume all the time and keep putting messages aside.

# Simulation: 2 builders, 2 commits for the same sequenceID, A has slot 1, B has slot 2
## Initial pass
* Builder A gets commit 1
* Builder B gets commit 2
* Builder A loads projection state (null) - assumes an insert will be necessary
* Builder B loads projection state (null) - assumes an insert will be necessary
* Builder A applies handlers
* Builder B applies handlers
* Builder A does insert() - succeeds
* Builder B does insert() - fails with a duplicate document error (this is a concurrency exception)
* Builder A acknowledges commit 1
* Builder B performs the out-of-sequence rejection procedure: saves commit 2 into staging area and acknowledges commit 2

## Picking up the staged commit
* Both builders are polling the staging area for things to process
* Any builder, or both, finds commit 2 staged
* The builder attempts to process the commit according to the Process stage
* One of the builders will surely fail with a concurrency exception, causing an ack and re-writing to the staging area

# Conclusions
* Special handling of concurrency exceptions (and other errors?) might offer improved performance
	* Just reject and try again, without any changes to the staging area?
