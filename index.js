/**
 * This is a platform for sockethub implementing XMPP functionality.
 *
 * Developed by Nick Jennings (https://github.com/silverbucket)
 *
 * sockethub is licensed under the LGPLv3.
 * See the LICENSE file for details.
 *
 * The latest version of this module can be found here:
 *   git://github.com/sockethub/sockethub-platform-xmpp.git
 *
 * For more information about sockethub visit http://sockethub.org/.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

if (typeof (xmpp) !== 'object') {
  xmpp = require('simple-xmpp');
}

const packageJSON = require('./package.json');
let idCounter = 0;

function buildFullJid(credentials) {
  let fullJid;

  // generate bareJid and fullJid
  if (credentials.object.username.indexOf('@') === -1) {
    fullJid = credentials.object.username + '@' + credentials.object.server + '/' + credentials.object.resource;
  } else {
    fullJid = credentials.object.username + '/' + credentials.object.resource;
  }

  return fullJid;
}

function buidXmppCredentials(fullJid, credentials) {
  // credential object to pass to simple-xmpp
  let xmpp_creds = {
    jid: fullJid,
    password: credentials.object.password
  };

  if (credentials.object.server) {
    xmpp_creds.host = credentials.object.server;
  }

  if (credentials.port) {
    xmpp_creds.port = credentials.object.port;
  }

  return xmpp_creds;
}

function nextId() {
  return ++idCounter;
}

/**
 * @class XMPP
 * @constructor
 *
 * @description
 * Handles all actions related to communication via. the XMPP protocol.
 *
 * Uses the `simple-xmpp` node module as a base tool for interacting with XMPP.
 *
 * {@link https://github.com/simple-xmpp/node-simple-xmpp}
 *
 * @param {object} session {@link Sockethub.Session#object}
 *
 */
class XMPP {
  constructor(cfg) {
    cfg = (typeof cfg === 'object') ? cfg : {};
    this.id = cfg.id; // actor
    this.debug = cfg.debug;
    this.sendToClient = cfg.sendToClient;
    this.__ih = new IncomingHandlers(this);
    this.__forceDisconnect = false;
    this.__channels = [];
  }

  /**
   * Property: schema
   *
   * @description
   * JSON schema defining the @types this platform accepts.
   *
   * Actual handling of incoming 'set' commands are handled by dispatcher,
   * but the dispatcher uses this defined schema to validate credentials
   * received, so that when a @context @type is called, it can fetch the
   * credentials (`session.getConfig()`), knowing they will have already been
   * validated against this schema.
   *
   *
   * In the below example, sockethub will validate the incoming credentials object
   * against whatever is defined in the `credentials` portion of the schema
   * object.
   *
   *
   * It will also check if the incoming AS object uses a @type which exists in the
   * `@types` portion of the schema object (should be an array of @type names).
   *
   * **NOTE**: For more information on using the credentials object from a client,
   * see [Sockethub Client](https://github.com/sockethub/sockethub/wiki/Sockethub-Client)
   *
   * Valid AS object for setting XMPP credentials:
   *
   * @example
   *
   * {
   *   '@type': 'set',
   *   context: 'xmpp',
   *   actor: {
   *     '@id': 'xmpp://testuser@jabber.net',
   *     '@type': 'person',
   *     displayName: 'Mr. Test User'
   *   },
   *   object: {
   *     '@type': 'credentials',
   *     server: 'jabber.net',
   *     username: 'testuser',
   *     password: 'asdasdasdasd',
   *     port: 5223,
   *     resource: 'phone'
   *   }
   * }
   **/
  get schema() {
    return {
      "version": packageJSON.version,
      "messages": {
        "required": ['@type'],
        "properties": {
          "@type": {
            "enum": ['connect', 'update', 'send', 'join', 'observe', 'request-friend', 'remove-friend', 'make-friend']
          }
        }
      },
      "credentials": {
        "required": ['object'],
        "properties": {
          // TODO platforms shouldn't have to define the actor property if they don't want to, just credential specifics
          "actor": {
            "type": "object",
            "required": ["@id"]
          },
          "object": {
            "name": "object",
            "type": "object",
            "required": ['@type', 'username', 'password', 'server', 'resource'],
            "additionalProperties": false,
            "properties": {
              "@type": {
                "name": "@type",
                "type": "string"
              },
              "username": {
                "name": "username",
                    "type": "string"
              },
              "password": {
                "name": "password",
                    "type": "string"
              },
              "server": {
                "name": "server",
                    "type": "string"
              },
              "port": {
                "name": "port",
                    "type": "number"
              },
              "resource": {
                "name": "resource",
                    "type": "string"
              }
            }
          }
        }
      }
    }
  };

  get config() {
    return {
      persist: true
    }
  };


  /**
   * Function: connect
   *
   * Connect to the XMPP server.
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'connect',
   *   actor: {
   *     '@id': 'xmpp://slvrbckt@jabber.net/Home',
   *     '@type': 'person',
   *     displayName: 'Nick Jennings',
   *     userName: 'slvrbckt'
   *   }
   * }
   */
  connect(job, credentials, done) {
    this.debug('connect() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('got client for ' + job.actor['@id']);
      done();
    });
  };

  /**
   * Function: join
   *
   * Join a room, optionally defining a display name for that room.
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'join',
   *   actor: {
   *     '@type': 'person'
   *     '@id': 'slvrbckt@jabber.net/Home',
   *   },
   *   object: {
   *     '@type': 'person',
   *     '@id': 'slvrbckt@jabber.net/Home',
   *     displayName: 'Mr. Pimp'
   *   },
   *   target: {
   *     '@type': 'room'
   *     '@id': 'PartyChatRoom@muc.jabber.net',
   *   }
   * }
   *
   */
  join(job, credentials, done) {
    this.debug('join() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('got client for ' + job.actor['@id']);
      //
      // send join
      this.debug('sending join to ' + `${job.target['@id']}/${job.actor.displayName}`);
      client.join(
          `${job.target['@id']}/${job.actor.displayName}`
          // TODO optional passwords not handled for now
      );
      done();
    });
  };


  /**
   * Function: send
   *
   * Send a message to a room or private conversation.
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'send',
   *   actor: {
   *     '@id': 'xmpp://slvrbckt@jabber.net/Home',
   *     '@type': 'person',
   *     displayName: 'Nick Jennings',
   *     userName: 'slvrbckt'
   *   },
   *   target: {
   *     '@id': 'xmpp://homer@jabber.net/Home',
   *     '@type': 'user',
   *     displayName: 'Homer'
   *   },
   *   object: {
   *     '@type': 'message',
   *     content: 'Hello from Sockethub!'
   *   }
   * }
   *
   */
  send(job, credentials, done) {
    this.debug('send() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('got client for ' + job.actor['@id']);
      //
      // send message
      this.debug('sending message to ' + job.target['@id']);
      client.send(
          job.target['@id'],
          job.object.content,
          job.target['@type'] === 'room'
      );
      done();
    });
  };


  /**
   * Function: update
   *
   * @description
   * Indicate presence and status message.
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'update',
   *   actor: {
   *     '@id': 'user@host.org/Home'
   *   },
   *   object: {
   *     '@type': 'presence'
   *     presence: 'chat',
   *     content: '...clever saying goes here...'
   *   }
   * }
   */
  update(job, credentials, done) {
    this.debug('update() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('got client for ' + job.actor['@id']);

      if (job.object['@type'] === 'presence') {
        const show = job.object.presence === 'available' ? 'chat' : job.object.show;
        const status = job.object.content || '';
        // setting presence
        this.debug('setting presence: ' + show + ' status: ' + status);
        client.setPresence(show, status);
        this.debug('requesting XMPP roster');
        client.getRoster();
        /*if (job.object.roster) {
          _.session.log('requesting roster list');
          client.getRoster();
        }*/
        done();
      } else {
        done('unknown object type (should be presence?): ' + job.object['@type']);
      }
    });
  };

  /**
   * Function: request-friend
   *
   * @description
   * Send friend request
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'request-friend',
   *   actor: {
   *     '@id': 'user@host.org/Home'
   *   },
   *   target: {
   *     '@id': 'xmpp://homer@jabber.net/Home',
   *   }
   * }
   */
  'request-friend'(job, credentials, done) {
    this.debug('request-friend() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('request friend ' + job.target['@id']);
      client.subscribe(job.target['@id']);
    });
  };

  /**
   * Function: remove-friend
   *
   * @description
   * Send a remove friend request
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'remove-friend',
   *   actor: {
   *     '@id': 'user@host.org/Home'
   *   },
   *   target: {
   *     '@id': 'xmpp://homer@jabber.net/Home',
   *   }
   * }
   */
  'remove-friend'(job, credentials, done) {
    this.debug('remove-friend() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('remove friend ' + job.target['@id']);
      client.unsubscribe(job.target['@id']);
    });
  };

  /**
   * Function: make-friend
   *
   * @description
   * Confirm a friend request
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   * {
   *   context: 'xmpp',
   *   '@type': 'make-friend',
   *   actor: {
   *     '@id': 'user@host.org/Home'
   *   },
   *   target: {
   *     '@id': 'xmpp://homer@jabber.net/Home',
   *   }
   * }
   */
  'make-friend'(job, credentials, done) {
    this.debug('make-friend() called for ' + job.actor['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('make friend ' + job.target['@id']);
      client.acceptSubscription(job.target['@id']);
    });
  };

  /**
   * Function: observe
   *
   * Indicate an intent to observe something (ie. get a list of users in a room).
   *
   * @param {object} job activiy streams object // TODO LINK
   * @param {object} credentials credentials object // TODO LINK
   * @param {object} done callback when job is done // TODO LINK
   *
   * @example
   *
   *  {
   *    context: 'xmpp',
   *    '@type': 'observe',
   *    actor: {
   *      '@id': 'slvrbckt@jabber.net/Home',
   *      '@type': 'person'
   *    },
   *    target: {
   *      '@id': 'PartyChatRoom@muc.jabber.net',
   *      '@type': 'room'
   *    },
   *    object: {
   *      '@type': 'attendance'
   *    }
   *  }
   *
   *
   *  // The obove object might return:
   *  {
   *    context: 'xmpp',
   *    '@type': 'observe',
   *    actor: {
   *      '@id': 'PartyChatRoom@muc.jabber.net',
   *      '@type': 'room'
   *    },
   *    target: {
   *      '@id': 'slvrbckt@jabber.net/Home',
   *      '@type': 'person'
   *    },
   *    object: {
   *      '@type': 'attendance'
   *      members: [
   *        'RyanGosling',
   *        'PeeWeeHerman',
   *        'Commando',
   *        'Smoochie',
   *        'neo'
   *      ]
   *    }
   *  }
   */
  observe(job, credentials, done) {
    this.debug('observe() called by ' + job.actor['@id'] + ' for ' + job.target['@id']);
    this.__getClient(job.actor['@id'], credentials, (err, client) => {
      if (err) {
        return done(err);
      }
      this.debug('got client for ' + job.actor['@id']);

      const stanza = new xmpp.Element('iq', {
        id: 'muc_id',
        type: 'get',
        from: job.actor['@id'],
        to: job.target['@id']
      });
      stanza.c('query', {xmlns: 'http://jabber.org/protocol/disco#items'});
      client.conn.send(stanza);
      done();
    });
  };

  cleanup(done) {
    // FIXME - review this, simple-xmpp has a close func now i believe
    this.debug('should be CLOSING connection now, NOT IMPLEMENTED in node-xmpp');
    this.__forceDisconnect = true;
    if ((this.__client) &&
        (typeof this.__client === 'object') &&
        (typeof this.__client.disconnect === 'function')) {
      this.__client.disconnect();
    }
    done();
  };


  __getClient(key, credentials, cb) {
    if (this.__client) {
      return cb(null, this.__client);
    }

    if (!credentials) {
      return cb('no client found, and no credentials specified.');
    }

    this.actor = credentials.actor;

    this.__connect(key, credentials, (err, client) => {
      if (err) {
        throw new Error(err);
      }
      this.__client = client;
      this.__registerListeners();
      return cb(null, client);
    });
  };


  __connect(key, credentials, cb) {
    this.debug('calling connect for ' + credentials.actor['@id']);

    const fullJid = buildFullJid(credentials);
    const xmppCreds = buidXmppCredentials(fullJid, credentials);

    function __removeListeners() {
      xmpp.removeListener('online', handlers.online);
      xmpp.removeListener('error', handlers.error);
      xmpp.removeListener('close', handlers.close);
    }

    const handlers = {
      error: (error) => {
        let msg = 'failed connecting ' + fullJid;
        msg = (error) ? msg + ' : ' + error : msg;
        this.debug("connect error: " + error);
        __removeListeners();
        xmpp.disconnect();
        cb(msg);
      },
      online: () => {
        this.debug('connected with jid: ' + fullJid);
        __removeListeners();
        cb(null, xmpp);
      },
      close: () => {
        // FIXME - not sure in what cases this happens
        this.debug('close received for ' + fullJid);
        __removeListeners();
        cb('received close event for ' + fullJid);
      }
    };

    xmpp.on('online', handlers.online);
    xmpp.on('error', handlers.error);
    xmpp.on('close', handlers.close);

    xmpp.connect(xmppCreds);
    this.debug('sent XMPP connect for account ' + fullJid);
  };


  __registerListeners() {
    this.__client.on('buddy', this.__ih.buddy);
    this.__client.on('buddyCapabilities', this.__ih.buddyCapabilities);
    this.__client.on('chat', this.__ih.chat);
    this.__client.on('close', this.__ih.close);
    this.__client.on('chatstate', this.__ih.chatstate);
    this.__client.on('error', this.__ih.error);
    this.__client.on('groupbuddy', this.__ih.groupBuddy);
    this.__client.on('groupchat', this.__ih.groupChat);
    this.__client.on('online', this.__ih.online);
    this.__client.on('subscribe', this.__ih.subscribe);
    this.__client.on('unsubscribe', this.__ih.unsubscribe);
    this.__client.on('stanza', this.__ih.__stanza);
  };
}

// isConnected: function () {
//   if (this.connection.STATUS === 'offline') {
//     return false;
//   } else {
//     return true;
//   }
// }

class IncomingHandlers {
  constructor(session) {
    this.session = session;
  }

  buddy(from, state, statusText) {
    if (from !== this.session.actor['@id']) {
      this.session.debug('received buddy presence update: ' + from + ' - ' + state);
      this.session.sendToClient({
        '@type': 'update',
        actor: { '@id': from },
        target: this.session.actor,
        object: {
          '@type': 'presence',
          status: statusText,
          presence: state
        }
      });
    }
  }

  buddyCapabilities(id, capabilities) {
    this.session.debug('received buddyCapabilities: ' + id, capabilities);
  }

  chat(from, message) {
    this.session.debug("received chat message from " + from);
    this.session.sendToClient({
      '@type': 'send',
      actor: {
        '@type': 'person',
        '@id': from
      },
      target: this.session.actor,
      object: {
        '@type': 'message',
        content: message,
        '@id': nextId()
      },
      published: new Date()
    });
  }

  chatstate(from, name) {
    this.session.debug('received chatstate event: ' + from, name);
  }

  close() {
    this.session.debug('received close event with no handler specified');
    this.session.sendToClient({
      '@type': 'close',
      actor: this.session.actor,
      target: this.session.actor
    });
    this.session.debug('**** xmpp this.session.for ' + this.session.actor['@id'] + ' closed');
    this.session.connection.disconnect();
  }

  error(error) {
    try {
      this.session.debug("*** XMPP ERROR (rl): " + error);
      this.session.sendToClient({
        '@type': 'error',
        object: {
          '@type': 'error',
          content: error
        }
      });
    } catch (e) {
      this.session.debug('*** XMPP ERROR (rl catch): ', e);
    }
  }

  groupBuddy(id, groupBuddy, state, statusText) {
    this.session.debug('received groupbuddy event: ' + id, groupBuddy, state, statusText);
    this.session.sendToClient({
      '@type': 'update',
      actor: {
        '@id': `${id}/${groupBuddy}`,
        '@type': 'person',
        displayName: groupBuddy
      },
      target: {
        '@id': id,
        '@type': 'room'
      },
      object: {
        '@type': 'presence',
        status: statusText,
        presence: state
      }
    });
  }

  groupChat(room, from, message, stamp) {
    this.session.debug('received groupchat event: ' + room, from, message, stamp);
    this.session.sendToClient({
      '@type': 'send',
      actor: {
        '@type': 'person',
        '@id': from
      },
      target: {
        '@type': 'room',
        '@id': room
      },
      object: {
        '@type': 'message',
        content: message,
        '@id': nextId()
      },
      published: new Date()
    });
  }

  online() {
    this.session.debug('online');
    this.session.debug('reconnectioned ' + this.session.actor['@id']);
  }

  subscribe(from) {
    this.session.debug('received subscribe request from ' + from);
    this.session.sendToClient({
      '@type': "request-friend",
      actor: { '@id': from },
      target: this.session.actor
    });
  }

  unsubscribe(from) {
    this.session.debug('received unsubscribe request from ' + from);
    this.session.sendToClient({
      '@type': "remove-friend",
      actor: { '@id': from },
      target: this.session.actor
    });
  }

  /**
   * Handles all unknown conditions that we don't have an explicit handler for
   **/
  __stanza(stanza) {
    this.session.debug("got XMPP stanza... " + stanza);

    // simple-xmpp currently doesn't seem to handle error state presence
    // so we'll do it here for now.
    // TODO: consider moving this.session.to simple-xmpp once it's ironed out and
    // proven to work well.
    if (stanza.is('presence') && (stanza.attrs.type === 'error')) {
      const error = stanza.getChild('error');
      let message = stanza.toString(),
          type = 'update';

      if (error) {
        message = error.toString();
        if (error.getChild('remote-server-not-found')) {
          // when we get this.session.type of return message, we know it was a response from a join
          type = 'join';
          message = 'remote server not found ' + stanza.attrs.from;
        }
      }

      this.session.sendToClient({
        '@type': type,
        actor: {
          '@id': stanza.attrs.from,
          '@type': 'room'
        },
        object: {
          '@type': 'error', // type error
          content: message
        },
        target: {
          '@id': stanza.attrs.to,
          '@type': 'person'
        }
      });
    } else if (stanza.is('iq')) {
      if (stanza.attrs.id === 'muc_id' && stanza.attrs.type === 'result') {
        this.session.debug('got room attendance list');
        this.roomAttendance(stanza);
        return;
      }

      const query = stanza.getChild('query');

      if (query) {
        const entries = query.getChildren('item');

        for (let e in entries) {
          if (! entries.hasOwnProperty(e)) {
            continue;
          }

          this.session.debug('STANZA ATTRS: ', entries[e].attrs);

          if (entries[e].attrs.subscription === 'both') {
            this.session.sendToClient({
              '@type': 'update',
              actor: { '@id': entries[e].attrs.jid, displayName: entries[e].attrs.name },
              target: this.session.actor,
              object: {
                '@type': 'presence',
                status: '',
                presence: state
              }
            });
          } else if ((entries[e].attrs.subscription === 'from') &&
                    (entries[e].attrs.ask) && (entries[e].attrs.ask === 'subscribe')) {
            this.session.sendToClient({
              '@type': 'update',
              actor: { '@id': entries[e].attrs.jid, displayName: entries[e].attrs.name },
              target: this.session.actor,
              object: {
                '@type': 'presence',
                statusText: '',
                presence: 'notauthorized'
              }
            });
          } else {
            /**
             * cant figure out how to know if one of these query stanzas are from
             * added contacts or pending requests
             */
            this.session.sendToClient({
              '@type': 'request-friend',
              actor: { '@id': entries[e].attrs.jid, displayName: entries[e].attrs.name },
              target: this.session.actor
            });
          }
        }
      }
    }
  }

  roomAttendance(stanza) {
    const query = stanza.getChild('query');
    if (query) {
      let members = [];
      const entries = query.getChildren('item');
      for (let e in entries) {
        if (!entries.hasOwnProperty(e)) {
          continue;
        }
        members.push(entries[e].attrs.name);
      }

      this.session.sendToClient({
        '@type': 'observe',
        actor: {
          '@id': stanza.attrs.from,
          '@type': 'room'
        },
        target: {
          '@id': stanza.attrs.to,
          '@type': 'person'
        },
        object: {
          '@type': 'attendance',
          members: members
        }
      });
    }
  }
}

module.exports = XMPP;
