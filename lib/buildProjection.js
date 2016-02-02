var when = require('when');

function CommitDifferentSequencesError() {
	this.name = 'CommitDifferentSequencesError';
	this.message = 'The projection builder may not process commits for different sequences in one batch';
	if (typeof Error.captureStackTrace === 'function') {
		Error.captureStackTrace(this, CommitDifferentSequencesError);
	}
}
CommitDifferentSequencesError.prototype = Object.create(Error.prototype);

function compareCommitSlots(commitA, commitB) {
	if (commitA.sequenceSlot < commitB.sequenceSlot) {
		return -1;
	}
	else if (commitA.sequenceSlot > commitB.sequenceSlot) {
		return 1;
	}
	else {
		return 0;
	}
}

function verifySameSequence(commits, sequenceID) {
	if (commits.some(function commitDiffersFromAssumed(commit) {
		return commit.sequenceID !== sequenceID;
	})) {
		throw new CommitDifferentSequencesError();
	}
}

function applyCommit(projection, commit, handler) {
	//TODO: Actually run some event handlers...
	return when.resolve(handler(commit));
}

function buildProjection(reportingStore, commits, handler) {
	// Guard clause: if no commits are to be processed, do nothing.
	if (commits.length === 0) {
		return;
	}
	// First, make sure that the commits are all for the same sequence. While at it, determine what sequenceID it is.
	var sequenceID = commits[0].sequenceID;
	verifySameSequence(commits, sequenceID);
	// Then, sort the commits. We will apply the commits in order, and if we encounter any gaps, the commits after the first gap
	//  will get temporarily discarded into a staging area.
	commits.sort(compareCommitSlots);
	
	// A session instance is like a transaction, but it may or may not guarantee atomicity.
	// It exists solely to make the life of ACID-compliant reporting store back-ends simpler.
	var session = reportingStore.getSession();
	
	var loadedVersion;
	var currentVersion;
	var commitsToStage;
	
	// First, load the projection state to see what is already in the DB.
	return session.loadProjection(sequenceID).then(function(projectionState) {
		loadedVersion = projectionState ? projectionState._version : 0;
		currentVersion = loadedVersion;
		// The projection state has been loaded. Now, conditionally apply all handlers, putting aside those commits that
		//  may not be applied immediately due to gaps.
		commitsToStage = [];
		return when.iterate(function(commitIndex) {
			return commitIndex + 1;
		}, function isAtEnd(commitIndex) {
			return commitIndex >= commits.length;
		}, function conditionallyApplyCommit(commitIndex) {
			var commitToApply = commits[commitIndex];
			if (commitToApply.sequenceSlot <= currentVersion) {
				// This is a duplicate - the commit has already been processed, as indicated by the projection version.
				console.log('* %s #%d → duplicate', commitToApply.sequenceID, commitToApply.sequenceSlot);
				return;
			}
			if (commitToApply.sequenceSlot !== (currentVersion + 1)) {
				// There must be a gap somewhere. Put the commit aside.
				commitsToStage.push(commitToApply);
				console.log('* %s #%d → staging', commitToApply.sequenceID, commitToApply.sequenceSlot);
				return;
			}
			// Since we've reached here, the sequence slot of the commit must be exactly currentVersion + 1.
			// Produce the updated projection state using appropriate handlers and increment the version number.
			return applyCommit(projectionState, commitToApply, handler).then(function(newState) {
				projectionState = newState;
				currentVersion += 1;
			});
		}, 0).then(function() {
			return projectionState;
		});
	}).then(function(finalProjectionState) {
		// Enrich the obtained projection with _version set to the produced version...
		finalProjectionState._version = currentVersion;
		// ...and save it:
		return session.saveProjection(sequenceID, finalProjectionState, loadedVersion, currentVersion);
	}).then(function putCommitsIntoStaging() {
		return session.stageCommits(commitsToStage);
	}).then(function endSession() {
		return session.end();
	});
	// NOTE: A separate .catch() is not required, since any error, including concurrency exceptions, results in a rejection anyway.
}

module.exports = buildProjection;
