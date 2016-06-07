import document from 'global/document';
import QUnit from 'qunit';
import sinon from 'sinon';
import tsmlj from 'tsmlj';
import videojs from 'video.js';
import plugin from '../src/plugin';

/**
 * Assertion for testing a subset of event data.
 *
 * @param  {Object} data
 * @param  {Object} expected
 * @param  {String} [message]
 */
QUnit.assert.eventDataMatches = function(data, expected, message) {
  this.deepEqual({
    from: data.from,
    to: data.to,

    // Convert interimEvents to extract only `time` and `type`.
    interimEvents: data.interimEvents.map(o => ({time: o.time, type: o.event.type}))
  }, expected, message);
};

QUnit.test('the environment is sane', function(assert) {
  assert.strictEqual(typeof Array.isArray, 'function', 'es5 exists');
  assert.strictEqual(typeof sinon, 'object', 'sinon exists');
  assert.strictEqual(typeof videojs, 'function', 'videojs exists');
  assert.strictEqual(typeof plugin, 'function', 'plugin is a function');
});

QUnit.module('videojs-per-source-behaviors', {

  beforeEach() {

    // Mock the environment's timers because certain things - particularly
    // player readiness - are asynchronous in video.js 5. This MUST come
    // before any player is created; otherwise, timers could get created
    // with the actual timer methods!
    this.clock = sinon.useFakeTimers();

    this.fixture = document.getElementById('qunit-fixture');
    this.video = document.createElement('video');
    this.fixture.appendChild(this.video);
    this.player = videojs(this.video);
    this.player.perSourceBehaviors();

    // Tick forward enough to ready the player.
    this.clock.tick(1);
  },

  afterEach() {
    this.player.dispose();
    this.clock.restore();
  }
});

QUnit.test('disabled()', function(assert) {
  let psb = this.player.perSourceBehaviors;

  assert.notOk(psb.disabled(), 'by default, per-source behaviors are not disabled');

  psb.disabled(true);
  assert.ok(psb.disabled(), 'per-source behaviors can be disabled');

  psb.disabled(false);
  assert.notOk(psb.disabled(), 'per-source behaviors can be enabled');
});

QUnit.test('"sourcechanged" event', function(assert) {
  const spy = sinon.spy();

  this.player.on('sourcechanged', spy);

  this.player.trigger('loadstart');
  this.player.trigger('canplay');
  this.player.trigger('play');
  this.player.trigger('playing');

  // For each assertion, tick 10ms to be sure multiple timeouts do not happen!
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 0, 'no source, no "sourcechanged" event');

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.trigger('play');
  this.player.trigger('playing');
  this.player.trigger('loadstart');
  this.player.trigger('canplay');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 1, 'with a source, got a "sourcechanged" event');

  assert.eventDataMatches(spy.getCall(0).args[1], {
    from: undefined,
    to: 'x-1.mp4',
    interimEvents: [{
      time: 11,
      type: 'play'
    }, {
      time: 11,
      type: 'playing'
    }, {
      time: 11,
      type: 'loadstart'
    }, {
      time: 11,
      type: 'canplay'
    }]
  });

  this.player.trigger('pause');
  this.player.trigger('emptied');
  this.player.trigger('abort');
  this.player.trigger('loadstart');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 1, tsmlj`
    subsequent events with same source do not trigger "sourcechanged"
  `);

  this.player.currentSrc = () => 'x-2.mp4';
  this.player.trigger('loadedmetadata');
  this.player.trigger('loadeddata');
  this.player.trigger('loadstart');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 2, 'with a new source, got a "sourcechanged" event');

  assert.eventDataMatches(spy.getCall(1).args[1], {
    from: 'x-1.mp4',
    to: 'x-2.mp4',
    interimEvents: [{
      time: 31,
      type: 'loadedmetadata'
    }, {
      time: 31,
      type: 'loadeddata'
    }, {
      time: 31,
      type: 'loadstart'
    }]
  });

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.trigger('play');
  this.player.trigger('canplay');
  this.player.trigger('loadstart');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 3, tsmlj`
    with a changed, but repeated, source, got a "sourcechanged" event
  `);

  assert.eventDataMatches(spy.getCall(2).args[1], {
    from: 'x-2.mp4',
    to: 'x-1.mp4',
    interimEvents: [{
      time: 41,
      type: 'play'
    }, {
      time: 41,
      type: 'canplay'
    }, {
      time: 41,
      type: 'loadstart'
    }]
  });

  // The "play" will trigger a listener
  this.player.trigger('play');
  this.player.trigger('canplay');
  this.player.currentSrc = () => 'x-2.mp4';
  this.player.trigger('playing');
  this.player.trigger('loadstart');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 4, tsmlj`
    changing the source while a timeout was queued triggered a
    "sourcechanged" event
  `);

  assert.eventDataMatches(spy.getCall(3).args[1], {
    from: 'x-1.mp4',
    to: 'x-2.mp4',
    interimEvents: [{
      time: 51,
      type: 'play'
    }, {
      time: 51,
      type: 'canplay'
    }, {
      time: 51,
      type: 'playing'
    }, {
      time: 51,
      type: 'loadstart'
    }]
  });

  this.player.perSourceBehaviors.disabled(true);
  this.player.currentSrc = () => 'x-1.mp4';
  this.player.trigger('loadedmetadata');
  this.player.trigger('loadeddata');
  this.player.trigger('loadstart');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 4, tsmlj`
    changing the source while per-source behaviors are disabled does NOT
    trigger a "sourcechanged" event
  `);

  this.player.perSourceBehaviors.disabled(false);
  this.player.trigger('play');
  this.player.trigger('loadstart');
  this.player.trigger('canplay');
  this.player.trigger('playing');
  this.clock.tick(10);

  assert.strictEqual(spy.callCount, 5, tsmlj`
    re-enabling per-source behaviors will start triggering "sourcechanged"
    events once again
  `);

  assert.eventDataMatches(spy.getCall(4).args[1], {
    from: 'x-2.mp4',
    to: 'x-1.mp4',
    interimEvents: [{
      time: 71,
      type: 'play'
    }, {
      time: 71,
      type: 'loadstart'
    }, {
      time: 71,
      type: 'canplay'
    }, {
      time: 71,
      type: 'playing'
    }]
  });
});

QUnit.test('onPerSrc() event binding', function(assert) {
  const spy = sinon.spy();

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.onPerSrc('foo', spy);
  this.player.trigger('foo');
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    an onPerSrc listener is called each time the event is triggered
    while source is unchanged
  `);

  this.player.currentSrc = () => 'x-2.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    an onPerSrc listener is not called if the event is triggered for
    a new source
  `);

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    restoring an old source, which had a listener does not trigger -
    the binding is gone
  `);

  this.player.currentSrc = () => {};
  this.player.onPerSrc('foo', spy);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 3, tsmlj`
    an onPerSrc listener does not care if there actually is a source
  `);

  this.player.currentSrc = () => 'x-3.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 3, tsmlj`
    but gaining a source still clears the previous listener
  `);

  // Bind a new onPerSrc listener for the latest source, then disable per-
  // source behaviors.
  this.player.onPerSrc('foo', spy);
  this.player.perSourceBehaviors.disabled(true);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 3, tsmlj`
    when per-source behaviors are disabled, listeners are not triggered
  `);

  this.player.perSourceBehaviors.disabled(false);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 4, tsmlj`
    when per-source behaviors are re-enabled, listeners are triggered
  `);
});

QUnit.test('onePerSrc() event binding', function(assert) {
  const spy = sinon.spy();

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.onePerSrc('foo', spy);
  this.player.trigger('foo');
  this.player.trigger('foo');
  this.player.trigger('foo');
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 1, tsmlj`
    an onePerSrc listener is called only once no matter how often the
    event is triggered while source is unchanged
  `);

  this.player.currentSrc = () => 'x-2.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 1, tsmlj`
    an onePerSrc listener is not called if the event is triggered for
    a new source
  `);

  this.player.currentSrc = () => 'x-1.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 1, tsmlj`
    restoring an old source, which had a listener does not trigger -
    the binding is gone
  `);

  this.player.currentSrc = () => {};
  this.player.onePerSrc('foo', spy);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    an onePerSrc listener does not care if there actually is a source
  `);

  this.player.currentSrc = () => 'x-3.mp4';
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    but gaining a source still clears the previous listener
  `);

  // Bind a new onePerSrc listener for the latest source, then disable per-
  // source behaviors.
  this.player.onePerSrc('foo', spy);
  this.player.perSourceBehaviors.disabled(true);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 2, tsmlj`
    when per-source behaviors are disabled, listeners are not triggered
  `);

  this.player.perSourceBehaviors.disabled(false);
  this.player.trigger('foo');

  assert.strictEqual(spy.callCount, 3, tsmlj`
    when per-source behaviors are re-enabled, listeners are triggered
  `);
});
