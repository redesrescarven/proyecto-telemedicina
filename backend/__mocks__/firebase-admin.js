// backend/__mocks__/firebase-admin.js
// Mock manual de firebase-admin para la suite de pruebas determinista.
// Emula Firestore en memoria para validar endpoints sin red ni credenciales reales.

'use strict';

let docSequence = 1000;

function autoId() {
    docSequence += 1;
    return `doc_${docSequence}`;
}

class MockTimestamp {
    constructor(date) {
        this._date = date || new Date();
    }
    toDate() {
        return this._date;
    }
    toMillis() {
        return this._date.getTime();
    }
}

function isPlainObject(value) {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof MockTimestamp);
}

function deepMerge(base, incoming) {
    const result = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(incoming || {})) {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = deepMerge(result[key], value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

function setNestedPath(target, dottedPath, value) {
    const parts = dottedPath.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (!isPlainObject(node[parts[i]])) {
            node[parts[i]] = {};
        }
        node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
}

class MockDocumentSnapshot {
    constructor(ref, data) {
        this.ref = ref;
        this._data = data === undefined ? null : data;
    }
    get id() {
        return this.ref.id;
    }
    get exists() {
        return this._data !== null;
    }
    data() {
        return this._data === null ? undefined : { ...this._data };
    }
}

class MockQuerySnapshot {
    constructor(docs) {
        this.docs = docs;
        this.size = docs.length;
        this.empty = docs.length === 0;
    }
    forEach(callback) {
        this.docs.forEach((doc) => callback(doc));
    }
}

class MockDocumentReference {
    constructor(firestore, path) {
        this._fs = firestore;
        this.path = path;
        this.id = path.split('/').pop();
    }
    _snapshot() {
        const memo = this._fs._docs[this.path];
        return new MockDocumentSnapshot(this, memo);
    }
    async get() {
        return this._snapshot();
    }
    async set(data, options) {
        const memo = this._fs._docs[this.path];
        if (options && options.merge) {
            this._fs._docs[this.path] = deepMerge(memo === undefined ? {} : memo, data);
        } else {
            this._fs._docs[this.path] = { ...data };
        }
        return this._snapshot();
    }
    async update(data) {
        if (this._fs._docs[this.path] === undefined) {
            this._fs._docs[this.path] = {};
        }
        for (const [key, value] of Object.entries(data)) {
            if (key.includes('.')) {
                setNestedPath(this._fs._docs[this.path], key, value);
            } else {
                this._fs._docs[this.path][key] = value;
            }
        }
        return this._snapshot();
    }
    async delete() {
        delete this._fs._docs[this.path];
    }
    collection(name) {
        return new MockCollectionReference(this._fs, `${this.path}/${name}`);
    }
}

class MockQuery {
    constructor(firestore, collectionPath, filters, orderBy) {
        this._fs = firestore;
        this._collectionPath = collectionPath;
        this._filters = filters || [];
        this._orderBy = orderBy || null;
    }
    where(fieldPath, opStr, value) {
        return new MockQuery(this._fs, this._collectionPath, [...this._filters, { fieldPath, opStr, value }], this._orderBy);
    }
    orderBy(fieldPath, direction) {
        return new MockQuery(this._fs, this._collectionPath, this._filters, { fieldPath, direction: direction || 'asc' });
    }
    async get() {
        const baseParts = this._collectionPath.split('/');
        let docs = Object.keys(this._fs._docs)
            .filter((docPath) => {
                const parts = docPath.split('/');
                if (parts.length !== baseParts.length + 1) {
                    return false;
                }
                return docPath.startsWith(`${this._collectionPath}/`);
            })
            .map((docPath) => new MockDocumentSnapshot(new MockDocumentReference(this._fs, docPath), this._fs._docs[docPath]));

        for (const filter of this._filters) {
            docs = docs.filter((doc) => {
                const value = doc._data === null ? undefined : doc._data[filter.fieldPath];
                switch (filter.opStr) {
                    case '==':
                        return value === filter.value;
                    case '!=':
                        return value !== filter.value;
                    case '>':
                        return value > filter.value;
                    case '>=':
                        return value >= filter.value;
                    case '<':
                        return value < filter.value;
                    case '<=':
                        return value <= filter.value;
                    case 'array-contains':
                        return Array.isArray(value) && value.includes(filter.value);
                    case 'in':
                        return Array.isArray(filter.value) && filter.value.includes(value);
                    default:
                        return true;
                }
            });
        }

        if (this._orderBy) {
            const { fieldPath, direction } = this._orderBy;
            docs.sort((a, b) => {
                const av = a._data === null ? undefined : a._data[fieldPath];
                const bv = b._data === null ? undefined : b._data[fieldPath];
                const aTime = av && typeof av.toMillis === 'function' ? av.toMillis() : (av ? new Date(av).getTime() : 0);
                const bTime = bv && typeof bv.toMillis === 'function' ? bv.toMillis() : (bv ? new Date(bv).getTime() : 0);
                const diff = aTime - bTime;
                return direction === 'desc' ? -diff : diff;
            });
        }

        return new MockQuerySnapshot(docs);
    }
}

class MockCollectionReference extends MockQuery {
    constructor(firestore, path) {
        super(firestore, path);
        this.path = path;
        this.id = path.split('/').pop();
    }
    doc(id) {
        if (id === undefined) {
            id = autoId();
        }
        return new MockDocumentReference(this._fs, `${this.path}/${id}`);
    }
    add(data) {
        const ref = this.doc();
        return ref.set(data).then(() => ref);
    }
    get() {
        return super.get();
    }
}

class MockCollectionGroup extends MockQuery {
    constructor(firestore, name) {
        super(firestore, '');
        this._name = name;
    }
    async get() {
        let docs = [];
        for (const [docPath, data] of Object.entries(this._fs._docs)) {
            const parts = docPath.split('/');
            // Las rutas de DOCUMENTO de Firestore tienen número par de segmentos
            // (collection/doc/collection/doc/...). El mock solo almacena documentos,
            // por lo que se descartan rutas impares (colecciones).
            if (parts.length % 2 !== 0) {
                continue;
            }
            if (parts[parts.length - 2] === this._name) {
                docs.push(new MockDocumentSnapshot(new MockDocumentReference(this._fs, docPath), data));
            }
        }
        for (const filter of this._filters || []) {
            docs = docs.filter((doc) => (doc._data ? doc._data[filter.fieldPath] === filter.value : false));
        }
        return new MockQuerySnapshot(docs);
    }
}

class MockTransaction {
    constructor(firestore) {
        this._fs = firestore;
    }
    async get(ref) {
        const memo = this._fs._docs[ref.path];
        return new MockDocumentSnapshot(ref, memo);
    }
    set(ref, data, options) {
        const memo = this._fs._docs[ref.path];
        if (options && options.merge) {
            this._fs._docs[ref.path] = deepMerge(memo === undefined ? {} : memo, data);
        } else {
            this._fs._docs[ref.path] = { ...data };
        }
        return this;
    }
    update(ref, data) {
        if (this._fs._docs[ref.path] === undefined) {
            this._fs._docs[ref.path] = {};
        }
        for (const [key, value] of Object.entries(data)) {
            if (key.includes('.')) {
                setNestedPath(this._fs._docs[ref.path], key, value);
            } else {
                this._fs._docs[ref.path][key] = value;
            }
        }
        return this;
    }
    delete(ref) {
        delete this._fs._docs[ref.path];
    }
}

class MockFirestore {
    constructor() {
        this._docs = {};
    }
    collection(path) {
        return new MockCollectionReference(this, path);
    }
    doc(path) {
        return new MockDocumentReference(this, path);
    }
    collectionGroup(name) {
        return new MockCollectionGroup(this, name);
    }
    runTransaction(fn) {
        return Promise.resolve(fn(new MockTransaction(this)));
    }
    _reset() {
        this._docs = {};
    }
}

const firestoreInstance = new MockFirestore();

const firestoreFn = jest.fn(() => firestoreInstance);
firestoreFn.FieldValue = {
    serverTimestamp: () => new MockTimestamp(),
    arrayUnion: (...elements) => elements,
    arrayRemove: (...elements) => elements,
    increment: (amount) => amount
};
firestoreFn.Timestamp = MockTimestamp;

module.exports = {
    initializeApp: jest.fn(() => ({})),
    credential: {
        cert: jest.fn(() => ({}))
    },
    firestore: firestoreFn,
    FieldValue: firestoreFn.FieldValue,
    Timestamp: MockTimestamp,
    __firestore: firestoreInstance,
    __helpers: {
        seed(path, data) {
            firestoreInstance._docs[path] = { ...data };
        },
        read(path) {
            return firestoreInstance._docs[path] ? { ...firestoreInstance._docs[path] } : null;
        },
        list(collectionPath) {
            const baseParts = collectionPath.split('/');
            return Object.keys(firestoreInstance._docs)
                .filter((docPath) => {
                    const parts = docPath.split('/');
                    return parts.length === baseParts.length + 1 && docPath.startsWith(`${collectionPath}/`);
                })
                .map((docPath) => ({ id: docPath.split('/').pop(), data: { ...firestoreInstance._docs[docPath] } }));
        },
        reset() {
            firestoreInstance._reset();
        },
        firestore: firestoreInstance
    }
};