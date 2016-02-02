var MongoSession = require('./MongoSession');

function MongoReportingStore(name, collection, stagingCollection) {
	this._projectionName = name;
	this._collection = collection;
	this._stagingCollection = stagingCollection;
}

MongoReportingStore.prototype._getQueryCondition = function _getQueryCondition(event, commit) {
	return {
		_id: commit.sequenceID
	};
};

MongoReportingStore.prototype.apply = function apply(handler, event, commit) {
	var self = this;
	var collection = self._collection;
	// Remember whether the entry existed when we first loaded it. If not, we shall perform an .insert() instead of an .update().
	var loadedVersion;
	// First, load the current version of the projection.
	return collection.findOne(self._getQueryCondition(event, commit)).then(function(projectionState) {
		loadedVersion = (projectionState ? projectionState._version : 0);
		return handler(projectionState, event, commit);
	}).then(function saveProjectionState(transformedProjectionState) {
		var replaceQueryCondition = self._getQueryCondition(event, commit);
		
		transformedProjectionState._id = replaceQueryCondition._id;
		transformedProjectionState._version = loadedVersion + 1;
		if (loadedVersion >= 1) {
			replaceQueryCondition._version = loadedVersion;
			return collection.replaceOne(replaceQueryCondition, transformedProjectionState).then(function(result) {
				// Check whether our update operation has matched the document. If not, this means someone else must have modified it in the meantime.
				if (result.matchedCount === 0) {
					//TODO: Custom error.
					throw new Error('Concurrency exception in Reporting Store');
				}
			});
		}
		else {
			return collection.insert(transformedProjectionState);
		}
	});
};

MongoReportingStore.prototype.getSession = function getSession() {
	return new MongoSession(this._projectionName, this._collection, this._stagingCollection);
};

module.exports = MongoReportingStore;
