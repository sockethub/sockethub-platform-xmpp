if(typeof(define) !== 'function') {
  var define = require('amdefine')(module);
}
define(['require'], function (require) {
  var suites = [];


  suites.push({
    name: "helper function tests",
    desc: "collection of tests for the xmpp platform helper functions",
    abortOnFail: true,
    setup: function (env, test) {
      env.Platform = require('./../index');
      test.done();
    },
    tests: [
      {
        desc: 'buildXmppCredentials',
        run: function (env, test) {
          const p = new env.Platform('foo');
          test.assert(p.__buildXmppCredentials('foo', {object:{port:123, server:'foo', password:'bar'}}),
              {
                jid: 'foo',
                password: 'bar',
                host: 'foo',
                port: 123
              }, false);
        }
      }
    ]
  });


  suites.push({
    name: "xmpp platform tests",
    desc: "collection of tests for the xmpp platform",
    abortOnFail: true,
    setup: function (env, test) {
      env.tv4 = require('./../node_modules/tv4/tv4');

      env.xmpp = require('./mock-simple-xmpp')(test);
      env.xmpp.mock = true;
      global.xmpp = env.xmpp;

      env.actor = {
        '@type': 'person',
        '@id': 'testingham@jabber.net',
        displayName:'testingham'
      };

      env.actor2 = {
        '@type': 'person',
        '@id': 'testingturkey@jabber.net',
        displayName:'testingturkey'
      };

      env.actor3 = {
        '@type': 'person',
        '@id': 'partyroom@jabber.net/king tut',
        displayName:'king tut'
      };

      env.credentials = {
        actor: env.actor,
        object: {
          '@type': 'credentials',
          username: 'testingham',
          server: 'jabber.net',
          password: 'foobar',
          resource: 'home'
        }
      };

      env.credentials2 = {
        actor: env.actor2,
        object: {
          '@type': 'credentials',
          username: 'testingturkey',
          server: 'jabber.net',
          password: 'foobar',
          resource: 'home'
        }
      };

      env.credentials2 = {
        actor: env.actor2,
        object: {
          '@type': 'credentials',
          username: 'testingturkey',
          server: 'jabber.net',
          password: 'foobar',
          resource: 'home'
        }
      };

      env.bad = {
        credentials: {
          one: {
            host: 'example.com',
            port: '6667'
          },
          two: {
            object: {
              nick: 'testingham',
              server: 'jabber.net'
            }
          }
        }
      };

      env.target = {
        mrfoobar: {
          '@type': 'person',
          '@id': 'mrfoobar@jabber.net',
          displayName: 'Mr FooBar'
        },
        partyroom: {
          '@type': 'room',
          '@id': 'partyroom@jabber.net'
        },
        roomuser: {
          '@type': 'room',
          '@id': 'partyroom@jabber.net/ms tut'
        }
      };

      env.job = {
        join: {
          actor: env.actor,
          object: {
            '@type': 'update',
            displayName: 'Frank'
          },
          target: env.target.partyroom
        },
        send: {
          chat: {
            actor: env.actor,
            object: {
              '@type': 'message',
              content: 'hello'
            },
            target: env.target.mrfoobar
          },
          groupchat: {
            actor: env.actor3,
            object: {
              '@type': 'message',
              content: 'hello'
            },
            target: env.target.roomuser
          }
        },
        update: {
          presence: {
            actor: env.actor,
            object: {
              '@type': 'presence',
              presence: 'available',
              status: 'available'
            }
          }
        },
        observe: {
          actor: env.actor,
          target: env.target.partyroom,
          object: {
            '@type': 'attendance'
          }
        }
      };

      env.job2 = {
        send: {
          actor: env.actor2,
          object: {
            '@type': 'message',
            content: 'hello'
          },
          target: env.target.mrfoobar
        }
      };

      var Platform = require('./../index');
      env.platform = new Platform({
        id: env.actor.actor,
        debug: console.log
      });

      // schema
      env.schema = env.platform.schema;

      // types
      env.types = env.schema.messages.properties['@type'].enum;
      test.assertAnd(env.types.sort(), [ 'update', 'make-friend', 'send', 'remove-friend', 'request-friend', 'join', 'connect', 'observe' ].sort());

      test.assertTypeAnd(env.xmpp, 'object');
      test.assertType(env.xmpp.connect, 'function');
    },
    takedown: function (env, test) {
      env.platform.cleanup(function () {
        test.done();
      });
    },
    tests: [
      {
        desc: 'bad credentials #one',
        run: function (env, test) {
          test.assert(env.tv4.validate(env.bad.credentials.one, env.schema.credentials), false);
        }
      },

      {
        desc: 'bad credentials #two',
        run: function (env, test) {
          test.assert(env.tv4.validate(env.bad.credentials.two, env.schema.credentials), false);
        }
      },

      {
        desc: 'good credentials',
        run: function (env, test) {
          test.assert(env.tv4.validate(env.credentials, env.schema.credentials), true);
        }
      },

      {
        desc: "# join",
        run: function (env, test) {
          env.platform.join(env.job.join, env.credentials, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            test.assert(env.xmpp.join.numCalled, 1);
          });
        }
      },

      {
        desc: "# join - sets the proper target",
        run: function (env, test) {
          const originalJoin = env.xmpp.join;
          env.xmpp.join = new test.Stub(function (target) {
            test.assert(target, 'partyroom@jabber.net/testingham');
            env.xmpp.join = originalJoin;
          });

          env.platform.join(env.job.join);
        }
      },

      {
        desc: "# send chat 1",
        run: function (env, test) {
          env.platform.send(env.job.send.chat, env.credentials, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            test.assert(env.xmpp.send.numCalled, 1);
          });
        }
      },
      {
        desc: "# send chat 2",
        run: function (env, test) {
          env.platform.send(env.job.send.chat, env.credentials, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            test.assert(env.xmpp.send.numCalled, 2);
          });
        }
      },
      {
        desc: "# send groupchat 1",
        run: function (env, test) {
          env.platform.send(env.job.send.groupchat, env.credentials3, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            test.assert(env.xmpp.send.numCalled, 3);
          });
        }
      },
      {
        desc: "# send - check stubs",
        run: function (env, test) {
          test.assert(env.xmpp.connect.numCalled, 1);
        }
      },

      {
        desc: "# update presence",
        run: function (env, test) {
          env.platform.update(env.job.update.presence, env.credentials, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            test.assert(env.xmpp.setPresence.numCalled, 1);
          });
        }
      },

      // {
      //   desc: "# send with second credentials",
      //   run: function (env, test) {
      //     env.platform.send(env.job2.send, env.credentials2, function (err, result) {
      //       test.assertTypeAnd(err, 'undefined', err);
      //       test.assertTypeAnd(result, 'undefined');
      //       test.assertAnd(env.xmpp.send.numCalled, 3);
      //       test.assert(env.xmpp.connect.numCalled, 2);
      //     });
      //   }
      // },

      {
        desc: "# observe",
        run: function (env, test) {
          const originalSend = env.xmpp.conn.send;
          let count = 0;
          env.xmpp.conn.send = new test.Stub(function(stanza) {
            test.assertAnd(stanza.is('iq'), true);
            test.assertAnd(stanza.attrs.id, 'muc_id');
            test.assertAnd(stanza.attrs.from, 'testingham@jabber.net');
            test.assertAnd(stanza.attrs.to, 'partyroom@jabber.net');
            env.xmpp.conn.send = originalSend;
            count++;
            if (count === 2) { test.done(); }
          });

          env.platform.observe(env.job.observe, env.credentials2, function (err, result) {
            test.assertTypeAnd(err, 'undefined', err);
            test.assertTypeAnd(result, 'undefined');
            count++;
            if (count === 2) { test.done(); }
          });
        }
      }
    ]
  });

  return suites;
});
