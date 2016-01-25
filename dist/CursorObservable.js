'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CursorObservable = undefined;

var _bind2 = require('fast.js/function/bind');

var _bind3 = _interopRequireDefault(_bind2);

var _checkTypes = require('check-types');

var _checkTypes2 = _interopRequireDefault(_checkTypes);

var _map2 = require('fast.js/map');

var _map3 = _interopRequireDefault(_map2);

var _Cursor2 = require('./Cursor');

var _Cursor3 = _interopRequireDefault(_Cursor2);

var _EJSON = require('./EJSON');

var _EJSON2 = _interopRequireDefault(_EJSON);

var _debounce = require('./debounce');

var _debounce2 = _interopRequireDefault(_debounce);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

// Defaults
var _defaultDebounce = 1000 / 60;
var _defaultBatchSize = 10;
var _noop = function _noop() {};

/**
 * Observable cursor is used for making request auto-updatable
 * after some changes is happen in a database.
 */

var CursorObservable = (function (_Cursor) {
  _inherits(CursorObservable, _Cursor);

  function CursorObservable(db, query, options) {
    _classCallCheck(this, CursorObservable);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(CursorObservable).call(this, db, query, options));

    _this.maybeUpdate = (0, _bind3.default)(_this.maybeUpdate, _this);
    _this._propagateUpdate = (0, _debounce2.default)((0, _bind3.default)(_this._propagateUpdate, _this), 0, 0);
    _this._doUpdate = (0, _debounce2.default)((0, _bind3.default)(_this._doUpdate, _this), _defaultDebounce, _defaultBatchSize);
    _this._latestResult = null;
    _this._observers = 0;
    return _this;
  }

  _createClass(CursorObservable, [{
    key: 'batchSize',

    /**
     * Change a batch size of updater.
     * Btach size is a number of changes must be happen
     * in debounce interval to force execute debounced
     * function (update a result, in our case)
     *
     * @param  {Number} batchSize
     * @return {CursorObservable}
     */
    value: function batchSize(_batchSize) {
      this._doUpdate.updateBatchSize(_batchSize);
      return this;
    }

    /**
     * Change debounce wait time of the updater
     * @param  {Number} waitTime
     * @return {CursorObservable}
     */

  }, {
    key: 'debounce',
    value: function debounce(waitTime) {
      this._doUpdate.updateWait(waitTime);
      return this;
    }

    /**
     * Observe changes of the cursor.
     * It returns a Stopper – Promise with `stop` function.
     * It is been resolved when first result of cursor is ready and
     * after first observe listener call.
     *
     * @param  {Function}
     * @param  {Object} options
     * @return {Stopper}
     */

  }, {
    key: 'observe',
    value: function observe() {
      var _this2 = this;

      var listener = arguments.length <= 0 || arguments[0] === undefined ? _noop : arguments[0];
      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      // Make new wrapper for make possible to observe
      // multiple times (for removeListener)
      var updateWrapper = function updateWrapper(a, b) {
        return _this2.maybeUpdate(a, b);
      };

      this.db.on('insert', updateWrapper);
      this.db.on('update', updateWrapper);
      this.db.on('remove', updateWrapper);

      var running = true;
      var self = this;
      function stopper() {
        if (running) {
          self.db.removeListener('insert', updateWrapper);
          self.db.removeListener('update', updateWrapper);
          self.db.removeListener('remove', updateWrapper);
          self.removeListener('update', listener);
          self.removeListener('stop', stopper);

          running = false;
          self._observers -= 1;
          if (self._observers === 0) {
            self._latestResult = null;
            self._latestIds = null;
            self.emit('stopped');
          }
        }
      }

      this._observers += 1;
      this.on('update', listener);
      this.on('stop', stopper);

      if (!this._updatePromise) {
        this.update(true, true);
      } else if (this._latestResult !== null) {
        listener(this._latestResult);
      }

      var cursorPromiseMixin = { stop: stopper };
      return this._createCursorPromise(this._updatePromise, cursorPromiseMixin);
    }

    /**
     * Stop all observers of the cursor by one call
     * of this function.
     * It also stops any delaied update of the cursor.
     */

  }, {
    key: 'stopObservers',
    value: function stopObservers() {
      this._doUpdate.cancel();
      this.emit('stop');
    }

    /**
     * Execute update. Cancel previous execution if it's
     * exists and start new one. Set `this._updatePromise`
     * execution promise that resolved when update completelly
     * executed.
     * @return {Promise}
     */

  }, {
    key: 'update',
    value: function update() {
      var firstRun = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];
      var immidiatelly = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

      if (this._updatePromise && this._updatePromise.cancel) {
        this._updatePromise.cancel();
      }
      this._updatePromise = immidiatelly ? this._doUpdate.func(firstRun) : this._doUpdate(firstRun);
      return this._updatePromise;
    }

    /**
     * Consider to update a query by given newDoc and oldDoc,
     * received form insert/udpate/remove oparation.
     * Should make a decision as smart as possible.
     * (Don't update a cursor if it does not change a result
     * of a cursor)
     *
     * TODO we should update _latestResult by hands in some cases
     *      without a calling of `update` method
     *
     * @param  {Object} newDoc
     * @param  {Object} oldDoc
     */

  }, {
    key: 'maybeUpdate',
    value: function maybeUpdate(newDoc, oldDoc) {
      // When no newDoc and no oldDoc provided then
      // it's a special case when no data about update
      // available and we always need to update a cursor
      var alwaysUpdateCursor = newDoc === null && oldDoc === null;

      // When it's remove operation we just check
      // that it's in our latest result ids list
      var removedFromResult = alwaysUpdateCursor || !newDoc && oldDoc && (!this._latestIds || this._latestIds.has(oldDoc._id));

      // When it's an update operation we check four things
      // 1. Is a new doc or old doc matched by a query?
      // 2. Is a new doc has different number of fields then an old doc?
      // 3. Is a new doc not equals to an old doc?
      var updatedInResult = removedFromResult || newDoc && oldDoc && (this._matcher.documentMatches(newDoc).result || this._matcher.documentMatches(oldDoc).result) && !_EJSON2.default.equals(newDoc, oldDoc);

      // When it's an insert operation we just check
      // it's match a query
      var insertedInResult = updatedInResult || newDoc && !oldDoc && this._matcher.documentMatches(newDoc).result;

      if (insertedInResult) {
        this.emit('cursorChanged');
        return this.update();
      }
    }

    /**
     * DEBOUNCED
     * Emits an update event with current result of a cursor
     * and call this method on parent cursor if it exists
     * and if it is not first run of update.
     * @return {Promise}
     */

  }, {
    key: '_propagateUpdate',
    value: function _propagateUpdate() {
      var firstRun = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      var updatePromise = this.emitAsync('update', this._latestResult, firstRun);

      var parentUpdatePromise = undefined;
      if (!firstRun) {
        parentUpdatePromise = Promise.all((0, _map3.default)(this._parentCursors, function (v, k) {
          if (v._propagateUpdate) {
            return v._propagateUpdate(false);
          }
        }));
      }

      return updatePromise.then(function () {
        return parentUpdatePromise;
      });
    }

    /**
     * DEBOUNCED
     * Execute query and propagate result to observers.
     * Resolved with result of execution.
     * @param  {Boolean} firstRun
     * @return {Promise}
     */

  }, {
    key: '_doUpdate',
    value: function _doUpdate() {
      var _this3 = this;

      var firstRun = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

      return this.exec().then(function (result) {
        _this3._latestResult = result;
        _this3._updateLatestIds();
        return _this3._propagateUpdate(firstRun).then(function () {
          return result;
        });
      });
    }

    /**
     * By a `_latestResult` update a `_latestIds` field of
     * the object
     */

  }, {
    key: '_updateLatestIds',
    value: function _updateLatestIds() {
      var idsArr = _checkTypes2.default.array(this._latestResult) ? (0, _map3.default)(this._latestResult, function (x) {
        return x._id;
      }) : this._latestResult && [this._latestResult._id];
      this._latestIds = new Set(idsArr);
    }

    /**
     * Track child cursor and stop child observer
     * if this cusros stopped or changed.
     * @param  {CursorPromise} cursorPromise
     */

  }, {
    key: '_trackChildCursorPromise',
    value: function _trackChildCursorPromise(cursorPromise) {
      var _this4 = this;

      _get(Object.getPrototypeOf(CursorObservable.prototype), '_trackChildCursorPromise', this).call(this, cursorPromise);
      var cursor = cursorPromise.cursor;
      var cleaner = function cleaner() {
        return delete _this4._childrenCursors[cursor._id];
      };

      cursor.once('stopped', cleaner);
      if (cursorPromise.stop) {
        this.once('cursorChanged', cursorPromise.stop);
        this.once('stopped', cursorPromise.stop);
      }
    }

    /**
     * Track parent cursor for propagating update event
     * to parent observers. Also remove parent if it is stopped.
     * @param  {Cursor} cursor
     */

  }, {
    key: '_trackParentCursor',
    value: function _trackParentCursor(cursor) {
      var _this5 = this;

      _get(Object.getPrototypeOf(CursorObservable.prototype), '_trackParentCursor', this).call(this, cursor);
      var cleaner = function cleaner() {
        return delete _this5._parentCursors[cursor._id];
      };
      cursor.once('stopped', cleaner);
    }
  }], [{
    key: 'defaultDebounce',
    value: function defaultDebounce() {
      if (arguments.length > 0) {
        _defaultDebounce = arguments[0];
      } else {
        return _defaultDebounce;
      }
    }
  }, {
    key: 'defaultBatchSize',
    value: function defaultBatchSize() {
      if (arguments.length > 0) {
        _defaultBatchSize = arguments[0];
      } else {
        return _defaultBatchSize;
      }
    }
  }]);

  return CursorObservable;
})(_Cursor3.default);

exports.CursorObservable = CursorObservable;
exports.default = CursorObservable;