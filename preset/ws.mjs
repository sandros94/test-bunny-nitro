//#region src/hooks.ts
var AdapterHookable = class {
	options;
	constructor(options) {
		this.options = options || {};
	}
	callHook(name, arg1, arg2) {
		const globalHook = this.options.hooks?.[name];
		const globalPromise = globalHook?.(arg1, arg2);
		const request = arg1.request || arg1;
		const resolveHooksPromise = this.options.resolve?.(request);
		if (!resolveHooksPromise) return globalPromise;
		const resolvePromise = resolveHooksPromise instanceof Promise ? resolveHooksPromise.then((hooks) => hooks?.[name]) : resolveHooksPromise?.[name];
		return Promise.all([globalPromise, resolvePromise]).then(([globalRes, hook]) => {
			const hookResPromise = hook?.(arg1, arg2);
			return hookResPromise instanceof Promise ? hookResPromise.then((hookRes) => hookRes || globalRes) : hookResPromise || globalRes;
		});
	}
	async upgrade(request) {
		let namespace = this.options.getNamespace?.(request) ?? new URL(request.url).pathname;
		const context = request.context || {};
		try {
			const res = await this.callHook("upgrade", request);
			if (!res) return {
				context,
				namespace
			};
			if (res.namespace) namespace = res.namespace;
			if (res.context) Object.assign(context, res.context);
			if (res instanceof Response) return {
				context,
				namespace,
				endResponse: res
			};
			if (res.headers) return {
				context,
				namespace,
				upgradeHeaders: res.headers
			};
		} catch (error) {
			const errResponse = error.response || error;
			if (errResponse instanceof Response) return {
				context,
				namespace,
				endResponse: errResponse
			};
			throw error;
		}
		return {
			context,
			namespace
		};
	}
};
function defineHooks(hooks) {
	return hooks;
}

//#endregion
//#region src/adapter.ts
function adapterUtils(globalPeers) {
	return {
		peers: globalPeers,
		publish(topic, message, options) {
			for (const peers of options?.namespace ? [globalPeers.get(options.namespace) || []] : globalPeers.values()) {
				let firstPeerWithTopic;
				for (const peer of peers) if (peer.topics.has(topic)) {
					firstPeerWithTopic = peer;
					break;
				}
				if (firstPeerWithTopic) {
					firstPeerWithTopic.send(message, options);
					firstPeerWithTopic.publish(topic, message, options);
				}
			}
		}
	};
}
function getPeers(globalPeers, namespace) {
	if (!namespace) throw new Error("Websocket publish namespace missing.");
	let peers = globalPeers.get(namespace);
	if (!peers) {
		peers = /* @__PURE__ */ new Set();
		globalPeers.set(namespace, peers);
	}
	return peers;
}
function defineWebSocketAdapter(factory) {
	return factory;
}

//#region src/utils.ts
const kNodeInspect = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
function toBufferLike(val) {
	if (val === void 0 || val === null) return "";
	const type = typeof val;
	if (type === "string") return val;
	if (type === "number" || type === "boolean" || type === "bigint") return val.toString();
	if (type === "function" || type === "symbol") return "{}";
	if (val instanceof Uint8Array || val instanceof ArrayBuffer) return val;
	if (isPlainObject(val)) return JSON.stringify(val);
	return val;
}
function toString(val) {
	if (typeof val === "string") return val;
	const data = toBufferLike(val);
	if (typeof data === "string") return data;
	return `data:application/octet-stream;base64,${btoa(String.fromCharCode(...new Uint8Array(data)))}`;
}
function isPlainObject(value) {
	if (value === null || typeof value !== "object") return false;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) return false;
	if (Symbol.iterator in value) return false;
	if (Symbol.toStringTag in value) return Object.prototype.toString.call(value) === "[object Module]";
	return true;
}

//#endregion
//#region src/message.ts
var Message = class {
	/** Access to the original [message event](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event) if available. */
	event;
	/** Access to the Peer that emitted the message. */
	peer;
	/** Raw message data (can be of any type). */
	rawData;
	#id;
	#uint8Array;
	#arrayBuffer;
	#blob;
	#text;
	#json;
	constructor(rawData, peer, event) {
		this.rawData = rawData || "";
		this.peer = peer;
		this.event = event;
	}
	/**
	* Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the message.
	*/
	get id() {
		if (!this.#id) this.#id = crypto.randomUUID();
		return this.#id;
	}
	/**
	* Get data as [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) value.
	*
	* If raw data is in any other format or string, it will be automatically converted and encoded.
	*/
	uint8Array() {
		const _uint8Array = this.#uint8Array;
		if (_uint8Array) return _uint8Array;
		const rawData = this.rawData;
		if (rawData instanceof Uint8Array) return this.#uint8Array = rawData;
		if (rawData instanceof ArrayBuffer || rawData instanceof SharedArrayBuffer) {
			this.#arrayBuffer = rawData;
			return this.#uint8Array = new Uint8Array(rawData);
		}
		if (typeof rawData === "string") {
			this.#text = rawData;
			return this.#uint8Array = new TextEncoder().encode(this.#text);
		}
		if (Symbol.iterator in rawData) return this.#uint8Array = new Uint8Array(rawData);
		if (typeof rawData?.length === "number") return this.#uint8Array = new Uint8Array(rawData);
		if (rawData instanceof DataView) return this.#uint8Array = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
		throw new TypeError(`Unsupported message type: ${Object.prototype.toString.call(rawData)}`);
	}
	/**
	* Get data as [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer) or [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) value.
	*
	* If raw data is in any other format or string, it will be automatically converted and encoded.
	*/
	arrayBuffer() {
		const _arrayBuffer = this.#arrayBuffer;
		if (_arrayBuffer) return _arrayBuffer;
		const rawData = this.rawData;
		if (rawData instanceof ArrayBuffer || rawData instanceof SharedArrayBuffer) return this.#arrayBuffer = rawData;
		return this.#arrayBuffer = this.uint8Array().buffer;
	}
	/**
	* Get data as [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) value.
	*
	* If raw data is in any other format or string, it will be automatically converted and encoded. */
	blob() {
		const _blob = this.#blob;
		if (_blob) return _blob;
		const rawData = this.rawData;
		if (rawData instanceof Blob) return this.#blob = rawData;
		return this.#blob = new Blob([this.uint8Array()]);
	}
	/**
	* Get stringified text version of the message.
	*
	* If raw data is in any other format, it will be automatically converted and decoded.
	*/
	text() {
		const _text = this.#text;
		if (_text) return _text;
		const rawData = this.rawData;
		if (typeof rawData === "string") return this.#text = rawData;
		return this.#text = new TextDecoder().decode(this.uint8Array());
	}
	/**
	* Get parsed version of the message text with [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse).
	*/
	json() {
		const _json = this.#json;
		if (_json) return _json;
		return this.#json = JSON.parse(this.text());
	}
	/**
	* Message data (value varies based on `peer.websocket.binaryType`).
	*/
	get data() {
		switch (this.peer?.websocket?.binaryType) {
			case "arraybuffer": return this.arrayBuffer();
			case "blob": return this.blob();
			case "nodebuffer": return globalThis.Buffer ? Buffer.from(this.uint8Array()) : this.uint8Array();
			case "uint8array": return this.uint8Array();
			case "text": return this.text();
			default: return this.rawData;
		}
	}
	toString() {
		return this.text();
	}
	[Symbol.toPrimitive]() {
		return this.text();
	}
	[kNodeInspect]() {
		return { message: {
			id: this.id,
			peer: this.peer,
			text: this.text()
		} };
	}
};

//#endregion
//#region src/peer.ts
var Peer = class {
	_internal;
	_topics;
	_id;
	#ws;
	constructor(internal) {
		this._topics = /* @__PURE__ */ new Set();
		this._internal = internal;
	}
	get context() {
		return this._internal.context ??= {};
	}
	get namespace() {
		return this._internal.namespace;
	}
	/**
	* Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
	*/
	get id() {
		if (!this._id) this._id = crypto.randomUUID();
		return this._id;
	}
	/** IP address of the peer */
	get remoteAddress() {}
	/** upgrade request */
	get request() {
		return this._internal.request;
	}
	/**
	* Get the [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) instance.
	*
	* **Note:** crossws adds polyfill for the following properties if native values are not available:
	* - `protocol`: Extracted from the `sec-websocket-protocol` header.
	* - `extensions`: Extracted from the `sec-websocket-extensions` header.
	* - `url`: Extracted from the request URL (http -> ws).
	* */
	get websocket() {
		if (!this.#ws) {
			const _ws = this._internal.ws;
			const _request = this._internal.request;
			this.#ws = _request ? createWsProxy(_ws, _request) : _ws;
		}
		return this.#ws;
	}
	/** All connected peers to the server */
	get peers() {
		return this._internal.peers || /* @__PURE__ */ new Set();
	}
	/** All topics, this peer has been subscribed to. */
	get topics() {
		return this._topics;
	}
	/** Abruptly close the connection */
	terminate() {
		this.close();
	}
	/** Subscribe to a topic */
	subscribe(topic) {
		this._topics.add(topic);
	}
	/** Unsubscribe from a topic */
	unsubscribe(topic) {
		this._topics.delete(topic);
	}
	toString() {
		return this.id;
	}
	[Symbol.toPrimitive]() {
		return this.id;
	}
	[Symbol.toStringTag]() {
		return "WebSocket";
	}
	[kNodeInspect]() {
		return { peer: {
			id: this.id,
			ip: this.remoteAddress
		} };
	}
};
function createWsProxy(ws, request) {
	return new Proxy(ws, { get: (target, prop) => {
		const value = Reflect.get(target, prop);
		if (!value) switch (prop) {
			case "protocol": return request?.headers?.get("sec-websocket-protocol") || "";
			case "extensions": return request?.headers?.get("sec-websocket-extensions") || "";
			case "url": return request?.url?.replace(/^http/, "ws") || void 0;
		}
		return value;
	} });
}

//#region src/error.ts
var WSError = class extends Error {
	constructor(...args) {
		super(...args);
		this.name = "WSError";
	}
};

//#region src/adapters/bunny.ts
const bunnyAdapter = (options = {}) => {
	const hooks = new AdapterHookable(options);
	const globalPeers = /* @__PURE__ */ new Map();
	return {
		...adapterUtils(globalPeers),
		handleUpgrade: async (request) => {
			if (!request.upgradeWebSocket || typeof request.upgradeWebSocket !== "function") throw new Error("[crossws] Bunny adapter requires the request to have an upgradeWebSocket method.");
			const { endResponse, context, namespace, upgradeHeaders } = await hooks.upgrade(request);
			if (endResponse) return endResponse;
			const negotiatedProtocol = (upgradeHeaders instanceof Headers ? upgradeHeaders : new Headers(upgradeHeaders)).get("sec-websocket-protocol") ?? options.protocol;
			const upgradeOptions = {};
			if (negotiatedProtocol) upgradeOptions.protocol = negotiatedProtocol;
			if (options.idleTimeout !== void 0) upgradeOptions.idleTimeout = options.idleTimeout;
			const { response, socket } = request.upgradeWebSocket(Object.keys(upgradeOptions).length > 0 ? upgradeOptions : void 0);
			const remoteAddress = request.headers.get("x-real-ip") || void 0;
			const peers = getPeers(globalPeers, namespace);
			const peer = new BunnyPeer({
				ws: socket,
				request,
				namespace,
				remoteAddress,
				peers,
				context
			});
			peers.add(peer);
			socket.addEventListener("open", () => {
				hooks.callHook("open", peer);
			});
			socket.addEventListener("message", (event) => {
				hooks.callHook("message", peer, new Message(event.data, peer, event));
			});
			socket.addEventListener("close", (event) => {
				peers.delete(peer);
				hooks.callHook("close", peer, {
					code: event.code,
					reason: event.reason
				});
			});
			socket.addEventListener("error", (error) => {
				peers.delete(peer);
				hooks.callHook("error", peer, new WSError(error));
			});
			return response;
		}
	};
};
var bunny_default = bunnyAdapter;
var BunnyPeer = class extends Peer {
	get remoteAddress() {
		return this._internal.remoteAddress;
	}
	send(data) {
		return this._internal.ws.send(toBufferLike(data));
	}
	publish(topic, data) {
		const dataBuff = toBufferLike(data);
		for (const peer of this._internal.peers) if (peer !== this && peer._topics.has(topic)) peer._internal.ws.send(dataBuff);
	}
	close(code, reason) {
		this._internal.ws.close(code, reason);
	}
	terminate() {
		this._internal.ws.close();
	}
};

//#endregion
export { bunny_default as default };
