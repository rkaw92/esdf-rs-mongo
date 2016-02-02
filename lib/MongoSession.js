var when = require('when');

function MongoSession(projectionName, dataCollection, stagingCollection) {
	this._projectionName = projectionName;
	this._dataCollection = dataCollection;
	this._stagingCollection = stagingCollection;
}

MongoSession.prototype.loadProjection = function loadProjection(sequenceID) {
	return this._dataCollection.findOne({ _id: sequenceID });
};

MongoSession.prototype.saveProjection = function saveProjection(sequenceID, newState, oldVersion, newVersion) {
	if (oldVersion >= 1) {
		// The projection already existed.
		return this._dataCollection.updateOne({ _id: sequenceID, _version: oldVersion }, newState).then(function(result) {
			// Check whether our update operation has matched the document. If not, this means someone else must have modified it in the meantime.
			if (result.matchedCount === 0) {
				//TODO: Custom error.
				throw new Error('Concurrency exception in Reporting Store');
			}
		});
	}
	else {
		// We are the first to create a projection for this ID.
		newState._id = sequenceID;
		return this._dataCollection.insert(newState);
	}
};

MongoSession.prototype.stageCommits = function stageCommits(commits) {
	if (commits.length === 0) {
		return when.resolve();
	}
	var sequenceID = commits[0].sequenceID;
	var firstSlot = commits[0].sequenceSlot;
	return this._stagingCollection.insert({
		projectionName: this._projectionName,
		sequenceID: sequenceID,
		firstSlot: firstSlot,
		commits: commits,
		since: new Date()
	});
};

MongoSession.prototype.end = function end() {
	// Since we are non-transactional, nothing needs to happen here.
	return when.resolve();
};

module.exports = MongoSession;
