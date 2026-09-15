var BlockbenchMCP = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
	var util;
	(function(util) {
		util.assertEqual = (_) => {};
		function assertIs(_arg) {}
		util.assertIs = assertIs;
		function assertNever(_x) {
			throw new Error();
		}
		util.assertNever = assertNever;
		util.arrayToEnum = (items) => {
			const obj = {};
			for (const item of items) obj[item] = item;
			return obj;
		};
		util.getValidEnumValues = (obj) => {
			const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
			const filtered = {};
			for (const k of validKeys) filtered[k] = obj[k];
			return util.objectValues(filtered);
		};
		util.objectValues = (obj) => {
			return util.objectKeys(obj).map(function(e) {
				return obj[e];
			});
		};
		util.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
			const keys = [];
			for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
			return keys;
		};
		util.find = (arr, checker) => {
			for (const item of arr) if (checker(item)) return item;
		};
		util.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
		function joinValues(array, separator = " | ") {
			return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
		}
		util.joinValues = joinValues;
		util.jsonStringifyReplacer = (_, value) => {
			if (typeof value === "bigint") return value.toString();
			return value;
		};
	})(util || (util = {}));
	var objectUtil;
	(function(objectUtil) {
		objectUtil.mergeShapes = (first, second) => {
			return {
				...first,
				...second
			};
		};
	})(objectUtil || (objectUtil = {}));
	const ZodParsedType = util.arrayToEnum([
		"string",
		"nan",
		"number",
		"integer",
		"float",
		"boolean",
		"date",
		"bigint",
		"symbol",
		"function",
		"undefined",
		"null",
		"array",
		"object",
		"unknown",
		"promise",
		"void",
		"never",
		"map",
		"set"
	]);
	const getParsedType = (data) => {
		switch (typeof data) {
			case "undefined": return ZodParsedType.undefined;
			case "string": return ZodParsedType.string;
			case "number": return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
			case "boolean": return ZodParsedType.boolean;
			case "function": return ZodParsedType.function;
			case "bigint": return ZodParsedType.bigint;
			case "symbol": return ZodParsedType.symbol;
			case "object":
				if (Array.isArray(data)) return ZodParsedType.array;
				if (data === null) return ZodParsedType.null;
				if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") return ZodParsedType.promise;
				if (typeof Map !== "undefined" && data instanceof Map) return ZodParsedType.map;
				if (typeof Set !== "undefined" && data instanceof Set) return ZodParsedType.set;
				if (typeof Date !== "undefined" && data instanceof Date) return ZodParsedType.date;
				return ZodParsedType.object;
			default: return ZodParsedType.unknown;
		}
	};
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
	const ZodIssueCode = util.arrayToEnum([
		"invalid_type",
		"invalid_literal",
		"custom",
		"invalid_union",
		"invalid_union_discriminator",
		"invalid_enum_value",
		"unrecognized_keys",
		"invalid_arguments",
		"invalid_return_type",
		"invalid_date",
		"invalid_string",
		"too_small",
		"too_big",
		"invalid_intersection_types",
		"not_multiple_of",
		"not_finite"
	]);
	var ZodError = class ZodError extends Error {
		get errors() {
			return this.issues;
		}
		constructor(issues) {
			super();
			this.issues = [];
			this.addIssue = (sub) => {
				this.issues = [...this.issues, sub];
			};
			this.addIssues = (subs = []) => {
				this.issues = [...this.issues, ...subs];
			};
			const actualProto = new.target.prototype;
			if (Object.setPrototypeOf) Object.setPrototypeOf(this, actualProto);
			else this.__proto__ = actualProto;
			this.name = "ZodError";
			this.issues = issues;
		}
		format(_mapper) {
			const mapper = _mapper || function(issue) {
				return issue.message;
			};
			const fieldErrors = { _errors: [] };
			const processError = (error) => {
				for (const issue of error.issues) if (issue.code === "invalid_union") issue.unionErrors.map(processError);
				else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
				else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
				else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
				else {
					let curr = fieldErrors;
					let i = 0;
					while (i < issue.path.length) {
						const el = issue.path[i];
						if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
						else {
							curr[el] = curr[el] || { _errors: [] };
							curr[el]._errors.push(mapper(issue));
						}
						curr = curr[el];
						i++;
					}
				}
			};
			processError(this);
			return fieldErrors;
		}
		static assert(value) {
			if (!(value instanceof ZodError)) throw new Error(`Not a ZodError: ${value}`);
		}
		toString() {
			return this.message;
		}
		get message() {
			return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
		}
		get isEmpty() {
			return this.issues.length === 0;
		}
		flatten(mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of this.issues) if (sub.path.length > 0) {
				const firstEl = sub.path[0];
				fieldErrors[firstEl] = fieldErrors[firstEl] || [];
				fieldErrors[firstEl].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		get formErrors() {
			return this.flatten();
		}
	};
	ZodError.create = (issues) => {
		return new ZodError(issues);
	};
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
	const errorMap = (issue, _ctx) => {
		let message;
		switch (issue.code) {
			case ZodIssueCode.invalid_type:
				if (issue.received === ZodParsedType.undefined) message = "Required";
				else message = `Expected ${issue.expected}, received ${issue.received}`;
				break;
			case ZodIssueCode.invalid_literal:
				message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
				break;
			case ZodIssueCode.unrecognized_keys:
				message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
				break;
			case ZodIssueCode.invalid_union:
				message = `Invalid input`;
				break;
			case ZodIssueCode.invalid_union_discriminator:
				message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
				break;
			case ZodIssueCode.invalid_enum_value:
				message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
				break;
			case ZodIssueCode.invalid_arguments:
				message = `Invalid function arguments`;
				break;
			case ZodIssueCode.invalid_return_type:
				message = `Invalid function return type`;
				break;
			case ZodIssueCode.invalid_date:
				message = `Invalid date`;
				break;
			case ZodIssueCode.invalid_string:
				if (typeof issue.validation === "object") {
					if ("includes" in issue.validation) {
						message = `Invalid input: must include "${issue.validation.includes}"`;
						if (typeof issue.validation.position === "number") message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
					} else if ("startsWith" in issue.validation) message = `Invalid input: must start with "${issue.validation.startsWith}"`;
					else if ("endsWith" in issue.validation) message = `Invalid input: must end with "${issue.validation.endsWith}"`;
					else util.assertNever(issue.validation);
				} else if (issue.validation !== "regex") message = `Invalid ${issue.validation}`;
				else message = "Invalid";
				break;
			case ZodIssueCode.too_small:
				if (issue.type === "array") message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
				else if (issue.type === "string") message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
				else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
				else if (issue.type === "bigint") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
				else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
				else message = "Invalid input";
				break;
			case ZodIssueCode.too_big:
				if (issue.type === "array") message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
				else if (issue.type === "string") message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
				else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
				else if (issue.type === "bigint") message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
				else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
				else message = "Invalid input";
				break;
			case ZodIssueCode.custom:
				message = `Invalid input`;
				break;
			case ZodIssueCode.invalid_intersection_types:
				message = `Intersection results could not be merged`;
				break;
			case ZodIssueCode.not_multiple_of:
				message = `Number must be a multiple of ${issue.multipleOf}`;
				break;
			case ZodIssueCode.not_finite:
				message = "Number must be finite";
				break;
			default:
				message = _ctx.defaultError;
				util.assertNever(issue);
		}
		return { message };
	};
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
	let overrideErrorMap = errorMap;
	function getErrorMap() {
		return overrideErrorMap;
	}
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
	const makeIssue = (params) => {
		const { data, path, errorMaps, issueData } = params;
		const fullPath = [...path, ...issueData.path || []];
		const fullIssue = {
			...issueData,
			path: fullPath
		};
		if (issueData.message !== void 0) return {
			...issueData,
			path: fullPath,
			message: issueData.message
		};
		let errorMessage = "";
		const maps = errorMaps.filter((m) => !!m).slice().reverse();
		for (const map of maps) errorMessage = map(fullIssue, {
			data,
			defaultError: errorMessage
		}).message;
		return {
			...issueData,
			path: fullPath,
			message: errorMessage
		};
	};
	function addIssueToContext(ctx, issueData) {
		const overrideMap = getErrorMap();
		const issue = makeIssue({
			issueData,
			data: ctx.data,
			path: ctx.path,
			errorMaps: [
				ctx.common.contextualErrorMap,
				ctx.schemaErrorMap,
				overrideMap,
				overrideMap === errorMap ? void 0 : errorMap
			].filter((x) => !!x)
		});
		ctx.common.issues.push(issue);
	}
	var ParseStatus = class ParseStatus {
		constructor() {
			this.value = "valid";
		}
		dirty() {
			if (this.value === "valid") this.value = "dirty";
		}
		abort() {
			if (this.value !== "aborted") this.value = "aborted";
		}
		static mergeArray(status, results) {
			const arrayValue = [];
			for (const s of results) {
				if (s.status === "aborted") return INVALID;
				if (s.status === "dirty") status.dirty();
				arrayValue.push(s.value);
			}
			return {
				status: status.value,
				value: arrayValue
			};
		}
		static async mergeObjectAsync(status, pairs) {
			const syncPairs = [];
			for (const pair of pairs) {
				const key = await pair.key;
				const value = await pair.value;
				syncPairs.push({
					key,
					value
				});
			}
			return ParseStatus.mergeObjectSync(status, syncPairs);
		}
		static mergeObjectSync(status, pairs) {
			const finalObject = {};
			for (const pair of pairs) {
				const { key, value } = pair;
				if (key.status === "aborted") return INVALID;
				if (value.status === "aborted") return INVALID;
				if (key.status === "dirty") status.dirty();
				if (value.status === "dirty") status.dirty();
				if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) finalObject[key.value] = value.value;
			}
			return {
				status: status.value,
				value: finalObject
			};
		}
	};
	const INVALID = Object.freeze({ status: "aborted" });
	const DIRTY = (value) => ({
		status: "dirty",
		value
	});
	const OK = (value) => ({
		status: "valid",
		value
	});
	const isAborted = (x) => x.status === "aborted";
	const isDirty = (x) => x.status === "dirty";
	const isValid = (x) => x.status === "valid";
	const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
	var errorUtil;
	(function(errorUtil) {
		errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
		errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
	})(errorUtil || (errorUtil = {}));
	//#endregion
	//#region ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
	var ParseInputLazyPath = class {
		constructor(parent, value, path, key) {
			this._cachedPath = [];
			this.parent = parent;
			this.data = value;
			this._path = path;
			this._key = key;
		}
		get path() {
			if (!this._cachedPath.length) {
				if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
				else this._cachedPath.push(...this._path, this._key);
			}
			return this._cachedPath;
		}
	};
	const handleResult = (ctx, result) => {
		if (isValid(result)) return {
			success: true,
			data: result.value
		};
		else {
			if (!ctx.common.issues.length) throw new Error("Validation failed but no issues detected.");
			return {
				success: false,
				get error() {
					if (this._error) return this._error;
					const error = new ZodError(ctx.common.issues);
					this._error = error;
					return this._error;
				}
			};
		}
	};
	function processCreateParams(params) {
		if (!params) return {};
		const { errorMap, invalid_type_error, required_error, description } = params;
		if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
		if (errorMap) return {
			errorMap,
			description
		};
		const customMap = (iss, ctx) => {
			const { message } = params;
			if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
			if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
			if (iss.code !== "invalid_type") return { message: ctx.defaultError };
			return { message: message ?? invalid_type_error ?? ctx.defaultError };
		};
		return {
			errorMap: customMap,
			description
		};
	}
	var ZodType = class {
		get description() {
			return this._def.description;
		}
		_getType(input) {
			return getParsedType(input.data);
		}
		_getOrReturnCtx(input, ctx) {
			return ctx || {
				common: input.parent.common,
				data: input.data,
				parsedType: getParsedType(input.data),
				schemaErrorMap: this._def.errorMap,
				path: input.path,
				parent: input.parent
			};
		}
		_processInputParams(input) {
			return {
				status: new ParseStatus(),
				ctx: {
					common: input.parent.common,
					data: input.data,
					parsedType: getParsedType(input.data),
					schemaErrorMap: this._def.errorMap,
					path: input.path,
					parent: input.parent
				}
			};
		}
		_parseSync(input) {
			const result = this._parse(input);
			if (isAsync(result)) throw new Error("Synchronous parse encountered promise.");
			return result;
		}
		_parseAsync(input) {
			const result = this._parse(input);
			return Promise.resolve(result);
		}
		parse(data, params) {
			const result = this.safeParse(data, params);
			if (result.success) return result.data;
			throw result.error;
		}
		safeParse(data, params) {
			const ctx = {
				common: {
					issues: [],
					async: params?.async ?? false,
					contextualErrorMap: params?.errorMap
				},
				path: params?.path || [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			const result = this._parseSync({
				data,
				path: ctx.path,
				parent: ctx
			});
			return handleResult(ctx, result);
		}
		"~validate"(data) {
			const ctx = {
				common: {
					issues: [],
					async: !!this["~standard"].async
				},
				path: [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			if (!this["~standard"].async) try {
				const result = this._parseSync({
					data,
					path: [],
					parent: ctx
				});
				return isValid(result) ? { value: result.value } : { issues: ctx.common.issues };
			} catch (err) {
				if (err?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
				ctx.common = {
					issues: [],
					async: true
				};
			}
			return this._parseAsync({
				data,
				path: [],
				parent: ctx
			}).then((result) => isValid(result) ? { value: result.value } : { issues: ctx.common.issues });
		}
		async parseAsync(data, params) {
			const result = await this.safeParseAsync(data, params);
			if (result.success) return result.data;
			throw result.error;
		}
		async safeParseAsync(data, params) {
			const ctx = {
				common: {
					issues: [],
					contextualErrorMap: params?.errorMap,
					async: true
				},
				path: params?.path || [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			const maybeAsyncResult = this._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
			const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
			return handleResult(ctx, result);
		}
		refine(check, message) {
			const getIssueProperties = (val) => {
				if (typeof message === "string" || typeof message === "undefined") return { message };
				else if (typeof message === "function") return message(val);
				else return message;
			};
			return this._refinement((val, ctx) => {
				const result = check(val);
				const setError = () => ctx.addIssue({
					code: ZodIssueCode.custom,
					...getIssueProperties(val)
				});
				if (typeof Promise !== "undefined" && result instanceof Promise) return result.then((data) => {
					if (!data) {
						setError();
						return false;
					} else return true;
				});
				if (!result) {
					setError();
					return false;
				} else return true;
			});
		}
		refinement(check, refinementData) {
			return this._refinement((val, ctx) => {
				if (!check(val)) {
					ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
					return false;
				} else return true;
			});
		}
		_refinement(refinement) {
			return new ZodEffects({
				schema: this,
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				effect: {
					type: "refinement",
					refinement
				}
			});
		}
		superRefine(refinement) {
			return this._refinement(refinement);
		}
		constructor(def) {
			this.spa = this.safeParseAsync;
			this._def = def;
			this.parse = this.parse.bind(this);
			this.safeParse = this.safeParse.bind(this);
			this.parseAsync = this.parseAsync.bind(this);
			this.safeParseAsync = this.safeParseAsync.bind(this);
			this.spa = this.spa.bind(this);
			this.refine = this.refine.bind(this);
			this.refinement = this.refinement.bind(this);
			this.superRefine = this.superRefine.bind(this);
			this.optional = this.optional.bind(this);
			this.nullable = this.nullable.bind(this);
			this.nullish = this.nullish.bind(this);
			this.array = this.array.bind(this);
			this.promise = this.promise.bind(this);
			this.or = this.or.bind(this);
			this.and = this.and.bind(this);
			this.transform = this.transform.bind(this);
			this.brand = this.brand.bind(this);
			this.default = this.default.bind(this);
			this.catch = this.catch.bind(this);
			this.describe = this.describe.bind(this);
			this.pipe = this.pipe.bind(this);
			this.readonly = this.readonly.bind(this);
			this.isNullable = this.isNullable.bind(this);
			this.isOptional = this.isOptional.bind(this);
			this["~standard"] = {
				version: 1,
				vendor: "zod",
				validate: (data) => this["~validate"](data)
			};
		}
		optional() {
			return ZodOptional.create(this, this._def);
		}
		nullable() {
			return ZodNullable.create(this, this._def);
		}
		nullish() {
			return this.nullable().optional();
		}
		array() {
			return ZodArray.create(this);
		}
		promise() {
			return ZodPromise.create(this, this._def);
		}
		or(option) {
			return ZodUnion.create([this, option], this._def);
		}
		and(incoming) {
			return ZodIntersection.create(this, incoming, this._def);
		}
		transform(transform) {
			return new ZodEffects({
				...processCreateParams(this._def),
				schema: this,
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				effect: {
					type: "transform",
					transform
				}
			});
		}
		default(def) {
			const defaultValueFunc = typeof def === "function" ? def : () => def;
			return new ZodDefault({
				...processCreateParams(this._def),
				innerType: this,
				defaultValue: defaultValueFunc,
				typeName: ZodFirstPartyTypeKind.ZodDefault
			});
		}
		brand() {
			return new ZodBranded({
				typeName: ZodFirstPartyTypeKind.ZodBranded,
				type: this,
				...processCreateParams(this._def)
			});
		}
		catch(def) {
			const catchValueFunc = typeof def === "function" ? def : () => def;
			return new ZodCatch({
				...processCreateParams(this._def),
				innerType: this,
				catchValue: catchValueFunc,
				typeName: ZodFirstPartyTypeKind.ZodCatch
			});
		}
		describe(description) {
			const This = this.constructor;
			return new This({
				...this._def,
				description
			});
		}
		pipe(target) {
			return ZodPipeline.create(this, target);
		}
		readonly() {
			return ZodReadonly.create(this);
		}
		isOptional() {
			return this.safeParse(void 0).success;
		}
		isNullable() {
			return this.safeParse(null).success;
		}
	};
	const cuidRegex = /^c[^\s-]{8,}$/i;
	const cuid2Regex = /^[0-9a-z]+$/;
	const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
	const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
	const nanoidRegex = /^[a-z0-9_-]{21}$/i;
	const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
	const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
	const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
	const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
	let emojiRegex;
	const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
	const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
	const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
	const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
	const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
	const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
	const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
	const dateRegex = new RegExp(`^${dateRegexSource}$`);
	function timeRegexSource(args) {
		let secondsRegexSource = `[0-5]\\d`;
		if (args.precision) secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
		else if (args.precision == null) secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
		const secondsQuantifier = args.precision ? "+" : "?";
		return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
	}
	function timeRegex(args) {
		return new RegExp(`^${timeRegexSource(args)}$`);
	}
	function datetimeRegex(args) {
		let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
		const opts = [];
		opts.push(args.local ? `Z?` : `Z`);
		if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
		regex = `${regex}(${opts.join("|")})`;
		return new RegExp(`^${regex}$`);
	}
	function isValidIP(ip, version) {
		if ((version === "v4" || !version) && ipv4Regex.test(ip)) return true;
		if ((version === "v6" || !version) && ipv6Regex.test(ip)) return true;
		return false;
	}
	function isValidJWT(jwt, alg) {
		if (!jwtRegex.test(jwt)) return false;
		try {
			const [header] = jwt.split(".");
			if (!header) return false;
			const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
			const decoded = JSON.parse(atob(base64));
			if (typeof decoded !== "object" || decoded === null) return false;
			if ("typ" in decoded && decoded?.typ !== "JWT") return false;
			if (!decoded.alg) return false;
			if (alg && decoded.alg !== alg) return false;
			return true;
		} catch {
			return false;
		}
	}
	function isValidCidr(ip, version) {
		if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) return true;
		if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) return true;
		return false;
	}
	var ZodString = class ZodString extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = String(input.data);
			if (this._getType(input) !== ZodParsedType.string) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.string,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const status = new ParseStatus();
			let ctx = void 0;
			for (const check of this._def.checks) if (check.kind === "min") {
				if (input.data.length < check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "string",
						inclusive: true,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (input.data.length > check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "string",
						inclusive: true,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "length") {
				const tooBig = input.data.length > check.value;
				const tooSmall = input.data.length < check.value;
				if (tooBig || tooSmall) {
					ctx = this._getOrReturnCtx(input, ctx);
					if (tooBig) addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "string",
						inclusive: true,
						exact: true,
						message: check.message
					});
					else if (tooSmall) addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "string",
						inclusive: true,
						exact: true,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "email") {
				if (!emailRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "email",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "emoji") {
				if (!emojiRegex) emojiRegex = new RegExp(_emojiRegex, "u");
				if (!emojiRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "emoji",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "uuid") {
				if (!uuidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "uuid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "nanoid") {
				if (!nanoidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "nanoid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cuid") {
				if (!cuidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cuid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cuid2") {
				if (!cuid2Regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cuid2",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "ulid") {
				if (!ulidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "ulid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "url") try {
				new URL(input.data);
			} catch {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "url",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
			else if (check.kind === "regex") {
				check.regex.lastIndex = 0;
				if (!check.regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "regex",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "trim") input.data = input.data.trim();
			else if (check.kind === "includes") {
				if (!input.data.includes(check.value, check.position)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: {
							includes: check.value,
							position: check.position
						},
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "toLowerCase") input.data = input.data.toLowerCase();
			else if (check.kind === "toUpperCase") input.data = input.data.toUpperCase();
			else if (check.kind === "startsWith") {
				if (!input.data.startsWith(check.value)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: { startsWith: check.value },
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "endsWith") {
				if (!input.data.endsWith(check.value)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: { endsWith: check.value },
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "datetime") {
				if (!datetimeRegex(check).test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "datetime",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "date") {
				if (!dateRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "date",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "time") {
				if (!timeRegex(check).test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "time",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "duration") {
				if (!durationRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "duration",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "ip") {
				if (!isValidIP(input.data, check.version)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "ip",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "jwt") {
				if (!isValidJWT(input.data, check.alg)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "jwt",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cidr") {
				if (!isValidCidr(input.data, check.version)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cidr",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "base64") {
				if (!base64Regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "base64",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "base64url") {
				if (!base64urlRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "base64url",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		_regex(regex, validation, message) {
			return this.refinement((data) => regex.test(data), {
				validation,
				code: ZodIssueCode.invalid_string,
				...errorUtil.errToObj(message)
			});
		}
		_addCheck(check) {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		email(message) {
			return this._addCheck({
				kind: "email",
				...errorUtil.errToObj(message)
			});
		}
		url(message) {
			return this._addCheck({
				kind: "url",
				...errorUtil.errToObj(message)
			});
		}
		emoji(message) {
			return this._addCheck({
				kind: "emoji",
				...errorUtil.errToObj(message)
			});
		}
		uuid(message) {
			return this._addCheck({
				kind: "uuid",
				...errorUtil.errToObj(message)
			});
		}
		nanoid(message) {
			return this._addCheck({
				kind: "nanoid",
				...errorUtil.errToObj(message)
			});
		}
		cuid(message) {
			return this._addCheck({
				kind: "cuid",
				...errorUtil.errToObj(message)
			});
		}
		cuid2(message) {
			return this._addCheck({
				kind: "cuid2",
				...errorUtil.errToObj(message)
			});
		}
		ulid(message) {
			return this._addCheck({
				kind: "ulid",
				...errorUtil.errToObj(message)
			});
		}
		base64(message) {
			return this._addCheck({
				kind: "base64",
				...errorUtil.errToObj(message)
			});
		}
		base64url(message) {
			return this._addCheck({
				kind: "base64url",
				...errorUtil.errToObj(message)
			});
		}
		jwt(options) {
			return this._addCheck({
				kind: "jwt",
				...errorUtil.errToObj(options)
			});
		}
		ip(options) {
			return this._addCheck({
				kind: "ip",
				...errorUtil.errToObj(options)
			});
		}
		cidr(options) {
			return this._addCheck({
				kind: "cidr",
				...errorUtil.errToObj(options)
			});
		}
		datetime(options) {
			if (typeof options === "string") return this._addCheck({
				kind: "datetime",
				precision: null,
				offset: false,
				local: false,
				message: options
			});
			return this._addCheck({
				kind: "datetime",
				precision: typeof options?.precision === "undefined" ? null : options?.precision,
				offset: options?.offset ?? false,
				local: options?.local ?? false,
				...errorUtil.errToObj(options?.message)
			});
		}
		date(message) {
			return this._addCheck({
				kind: "date",
				message
			});
		}
		time(options) {
			if (typeof options === "string") return this._addCheck({
				kind: "time",
				precision: null,
				message: options
			});
			return this._addCheck({
				kind: "time",
				precision: typeof options?.precision === "undefined" ? null : options?.precision,
				...errorUtil.errToObj(options?.message)
			});
		}
		duration(message) {
			return this._addCheck({
				kind: "duration",
				...errorUtil.errToObj(message)
			});
		}
		regex(regex, message) {
			return this._addCheck({
				kind: "regex",
				regex,
				...errorUtil.errToObj(message)
			});
		}
		includes(value, options) {
			return this._addCheck({
				kind: "includes",
				value,
				position: options?.position,
				...errorUtil.errToObj(options?.message)
			});
		}
		startsWith(value, message) {
			return this._addCheck({
				kind: "startsWith",
				value,
				...errorUtil.errToObj(message)
			});
		}
		endsWith(value, message) {
			return this._addCheck({
				kind: "endsWith",
				value,
				...errorUtil.errToObj(message)
			});
		}
		min(minLength, message) {
			return this._addCheck({
				kind: "min",
				value: minLength,
				...errorUtil.errToObj(message)
			});
		}
		max(maxLength, message) {
			return this._addCheck({
				kind: "max",
				value: maxLength,
				...errorUtil.errToObj(message)
			});
		}
		length(len, message) {
			return this._addCheck({
				kind: "length",
				value: len,
				...errorUtil.errToObj(message)
			});
		}
		nonempty(message) {
			return this.min(1, errorUtil.errToObj(message));
		}
		trim() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "trim" }]
			});
		}
		toLowerCase() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "toLowerCase" }]
			});
		}
		toUpperCase() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "toUpperCase" }]
			});
		}
		get isDatetime() {
			return !!this._def.checks.find((ch) => ch.kind === "datetime");
		}
		get isDate() {
			return !!this._def.checks.find((ch) => ch.kind === "date");
		}
		get isTime() {
			return !!this._def.checks.find((ch) => ch.kind === "time");
		}
		get isDuration() {
			return !!this._def.checks.find((ch) => ch.kind === "duration");
		}
		get isEmail() {
			return !!this._def.checks.find((ch) => ch.kind === "email");
		}
		get isURL() {
			return !!this._def.checks.find((ch) => ch.kind === "url");
		}
		get isEmoji() {
			return !!this._def.checks.find((ch) => ch.kind === "emoji");
		}
		get isUUID() {
			return !!this._def.checks.find((ch) => ch.kind === "uuid");
		}
		get isNANOID() {
			return !!this._def.checks.find((ch) => ch.kind === "nanoid");
		}
		get isCUID() {
			return !!this._def.checks.find((ch) => ch.kind === "cuid");
		}
		get isCUID2() {
			return !!this._def.checks.find((ch) => ch.kind === "cuid2");
		}
		get isULID() {
			return !!this._def.checks.find((ch) => ch.kind === "ulid");
		}
		get isIP() {
			return !!this._def.checks.find((ch) => ch.kind === "ip");
		}
		get isCIDR() {
			return !!this._def.checks.find((ch) => ch.kind === "cidr");
		}
		get isBase64() {
			return !!this._def.checks.find((ch) => ch.kind === "base64");
		}
		get isBase64url() {
			return !!this._def.checks.find((ch) => ch.kind === "base64url");
		}
		get minLength() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxLength() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
	};
	ZodString.create = (params) => {
		return new ZodString({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodString,
			coerce: params?.coerce ?? false,
			...processCreateParams(params)
		});
	};
	function floatSafeRemainder(val, step) {
		const valDecCount = (val.toString().split(".")[1] || "").length;
		const stepDecCount = (step.toString().split(".")[1] || "").length;
		const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
		return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
	}
	var ZodNumber = class ZodNumber extends ZodType {
		constructor() {
			super(...arguments);
			this.min = this.gte;
			this.max = this.lte;
			this.step = this.multipleOf;
		}
		_parse(input) {
			if (this._def.coerce) input.data = Number(input.data);
			if (this._getType(input) !== ZodParsedType.number) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.number,
					received: ctx.parsedType
				});
				return INVALID;
			}
			let ctx = void 0;
			const status = new ParseStatus();
			for (const check of this._def.checks) if (check.kind === "int") {
				if (!util.isInteger(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: "integer",
						received: "float",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "min") {
				if (check.inclusive ? input.data < check.value : input.data <= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "number",
						inclusive: check.inclusive,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (check.inclusive ? input.data > check.value : input.data >= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "number",
						inclusive: check.inclusive,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "multipleOf") {
				if (floatSafeRemainder(input.data, check.value) !== 0) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_multiple_of,
						multipleOf: check.value,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "finite") {
				if (!Number.isFinite(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_finite,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		gte(value, message) {
			return this.setLimit("min", value, true, errorUtil.toString(message));
		}
		gt(value, message) {
			return this.setLimit("min", value, false, errorUtil.toString(message));
		}
		lte(value, message) {
			return this.setLimit("max", value, true, errorUtil.toString(message));
		}
		lt(value, message) {
			return this.setLimit("max", value, false, errorUtil.toString(message));
		}
		setLimit(kind, value, inclusive, message) {
			return new ZodNumber({
				...this._def,
				checks: [...this._def.checks, {
					kind,
					value,
					inclusive,
					message: errorUtil.toString(message)
				}]
			});
		}
		_addCheck(check) {
			return new ZodNumber({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		int(message) {
			return this._addCheck({
				kind: "int",
				message: errorUtil.toString(message)
			});
		}
		positive(message) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		negative(message) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		nonpositive(message) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		nonnegative(message) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		multipleOf(value, message) {
			return this._addCheck({
				kind: "multipleOf",
				value,
				message: errorUtil.toString(message)
			});
		}
		finite(message) {
			return this._addCheck({
				kind: "finite",
				message: errorUtil.toString(message)
			});
		}
		safe(message) {
			return this._addCheck({
				kind: "min",
				inclusive: true,
				value: Number.MIN_SAFE_INTEGER,
				message: errorUtil.toString(message)
			})._addCheck({
				kind: "max",
				inclusive: true,
				value: Number.MAX_SAFE_INTEGER,
				message: errorUtil.toString(message)
			});
		}
		get minValue() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxValue() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
		get isInt() {
			return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
		}
		get isFinite() {
			let max = null;
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") return true;
			else if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			} else if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return Number.isFinite(min) && Number.isFinite(max);
		}
	};
	ZodNumber.create = (params) => {
		return new ZodNumber({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodNumber,
			coerce: params?.coerce || false,
			...processCreateParams(params)
		});
	};
	var ZodBigInt = class ZodBigInt extends ZodType {
		constructor() {
			super(...arguments);
			this.min = this.gte;
			this.max = this.lte;
		}
		_parse(input) {
			if (this._def.coerce) try {
				input.data = BigInt(input.data);
			} catch {
				return this._getInvalidInput(input);
			}
			if (this._getType(input) !== ZodParsedType.bigint) return this._getInvalidInput(input);
			let ctx = void 0;
			const status = new ParseStatus();
			for (const check of this._def.checks) if (check.kind === "min") {
				if (check.inclusive ? input.data < check.value : input.data <= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						type: "bigint",
						minimum: check.value,
						inclusive: check.inclusive,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (check.inclusive ? input.data > check.value : input.data >= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						type: "bigint",
						maximum: check.value,
						inclusive: check.inclusive,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "multipleOf") {
				if (input.data % check.value !== BigInt(0)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_multiple_of,
						multipleOf: check.value,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		_getInvalidInput(input) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.bigint,
				received: ctx.parsedType
			});
			return INVALID;
		}
		gte(value, message) {
			return this.setLimit("min", value, true, errorUtil.toString(message));
		}
		gt(value, message) {
			return this.setLimit("min", value, false, errorUtil.toString(message));
		}
		lte(value, message) {
			return this.setLimit("max", value, true, errorUtil.toString(message));
		}
		lt(value, message) {
			return this.setLimit("max", value, false, errorUtil.toString(message));
		}
		setLimit(kind, value, inclusive, message) {
			return new ZodBigInt({
				...this._def,
				checks: [...this._def.checks, {
					kind,
					value,
					inclusive,
					message: errorUtil.toString(message)
				}]
			});
		}
		_addCheck(check) {
			return new ZodBigInt({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		positive(message) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		negative(message) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		nonpositive(message) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		nonnegative(message) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		multipleOf(value, message) {
			return this._addCheck({
				kind: "multipleOf",
				value,
				message: errorUtil.toString(message)
			});
		}
		get minValue() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxValue() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
	};
	ZodBigInt.create = (params) => {
		return new ZodBigInt({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodBigInt,
			coerce: params?.coerce ?? false,
			...processCreateParams(params)
		});
	};
	var ZodBoolean = class extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = Boolean(input.data);
			if (this._getType(input) !== ZodParsedType.boolean) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.boolean,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodBoolean.create = (params) => {
		return new ZodBoolean({
			typeName: ZodFirstPartyTypeKind.ZodBoolean,
			coerce: params?.coerce || false,
			...processCreateParams(params)
		});
	};
	var ZodDate = class ZodDate extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = new Date(input.data);
			if (this._getType(input) !== ZodParsedType.date) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.date,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (Number.isNaN(input.data.getTime())) {
				addIssueToContext(this._getOrReturnCtx(input), { code: ZodIssueCode.invalid_date });
				return INVALID;
			}
			const status = new ParseStatus();
			let ctx = void 0;
			for (const check of this._def.checks) if (check.kind === "min") {
				if (input.data.getTime() < check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						message: check.message,
						inclusive: true,
						exact: false,
						minimum: check.value,
						type: "date"
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (input.data.getTime() > check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						message: check.message,
						inclusive: true,
						exact: false,
						maximum: check.value,
						type: "date"
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: new Date(input.data.getTime())
			};
		}
		_addCheck(check) {
			return new ZodDate({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		min(minDate, message) {
			return this._addCheck({
				kind: "min",
				value: minDate.getTime(),
				message: errorUtil.toString(message)
			});
		}
		max(maxDate, message) {
			return this._addCheck({
				kind: "max",
				value: maxDate.getTime(),
				message: errorUtil.toString(message)
			});
		}
		get minDate() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min != null ? new Date(min) : null;
		}
		get maxDate() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max != null ? new Date(max) : null;
		}
	};
	ZodDate.create = (params) => {
		return new ZodDate({
			checks: [],
			coerce: params?.coerce || false,
			typeName: ZodFirstPartyTypeKind.ZodDate,
			...processCreateParams(params)
		});
	};
	var ZodSymbol = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.symbol) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.symbol,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodSymbol.create = (params) => {
		return new ZodSymbol({
			typeName: ZodFirstPartyTypeKind.ZodSymbol,
			...processCreateParams(params)
		});
	};
	var ZodUndefined = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.undefined) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.undefined,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodUndefined.create = (params) => {
		return new ZodUndefined({
			typeName: ZodFirstPartyTypeKind.ZodUndefined,
			...processCreateParams(params)
		});
	};
	var ZodNull = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.null) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.null,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodNull.create = (params) => {
		return new ZodNull({
			typeName: ZodFirstPartyTypeKind.ZodNull,
			...processCreateParams(params)
		});
	};
	var ZodAny = class extends ZodType {
		constructor() {
			super(...arguments);
			this._any = true;
		}
		_parse(input) {
			return OK(input.data);
		}
	};
	ZodAny.create = (params) => {
		return new ZodAny({
			typeName: ZodFirstPartyTypeKind.ZodAny,
			...processCreateParams(params)
		});
	};
	var ZodUnknown = class extends ZodType {
		constructor() {
			super(...arguments);
			this._unknown = true;
		}
		_parse(input) {
			return OK(input.data);
		}
	};
	ZodUnknown.create = (params) => {
		return new ZodUnknown({
			typeName: ZodFirstPartyTypeKind.ZodUnknown,
			...processCreateParams(params)
		});
	};
	var ZodNever = class extends ZodType {
		_parse(input) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.never,
				received: ctx.parsedType
			});
			return INVALID;
		}
	};
	ZodNever.create = (params) => {
		return new ZodNever({
			typeName: ZodFirstPartyTypeKind.ZodNever,
			...processCreateParams(params)
		});
	};
	var ZodVoid = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.undefined) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.void,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodVoid.create = (params) => {
		return new ZodVoid({
			typeName: ZodFirstPartyTypeKind.ZodVoid,
			...processCreateParams(params)
		});
	};
	var ZodArray = class ZodArray extends ZodType {
		_parse(input) {
			const { ctx, status } = this._processInputParams(input);
			const def = this._def;
			if (ctx.parsedType !== ZodParsedType.array) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.array,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (def.exactLength !== null) {
				const tooBig = ctx.data.length > def.exactLength.value;
				const tooSmall = ctx.data.length < def.exactLength.value;
				if (tooBig || tooSmall) {
					addIssueToContext(ctx, {
						code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
						minimum: tooSmall ? def.exactLength.value : void 0,
						maximum: tooBig ? def.exactLength.value : void 0,
						type: "array",
						inclusive: true,
						exact: true,
						message: def.exactLength.message
					});
					status.dirty();
				}
			}
			if (def.minLength !== null) {
				if (ctx.data.length < def.minLength.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: def.minLength.value,
						type: "array",
						inclusive: true,
						exact: false,
						message: def.minLength.message
					});
					status.dirty();
				}
			}
			if (def.maxLength !== null) {
				if (ctx.data.length > def.maxLength.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: def.maxLength.value,
						type: "array",
						inclusive: true,
						exact: false,
						message: def.maxLength.message
					});
					status.dirty();
				}
			}
			if (ctx.common.async) return Promise.all([...ctx.data].map((item, i) => {
				return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
			})).then((result) => {
				return ParseStatus.mergeArray(status, result);
			});
			const result = [...ctx.data].map((item, i) => {
				return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
			});
			return ParseStatus.mergeArray(status, result);
		}
		get element() {
			return this._def.type;
		}
		min(minLength, message) {
			return new ZodArray({
				...this._def,
				minLength: {
					value: minLength,
					message: errorUtil.toString(message)
				}
			});
		}
		max(maxLength, message) {
			return new ZodArray({
				...this._def,
				maxLength: {
					value: maxLength,
					message: errorUtil.toString(message)
				}
			});
		}
		length(len, message) {
			return new ZodArray({
				...this._def,
				exactLength: {
					value: len,
					message: errorUtil.toString(message)
				}
			});
		}
		nonempty(message) {
			return this.min(1, message);
		}
	};
	ZodArray.create = (schema, params) => {
		return new ZodArray({
			type: schema,
			minLength: null,
			maxLength: null,
			exactLength: null,
			typeName: ZodFirstPartyTypeKind.ZodArray,
			...processCreateParams(params)
		});
	};
	function deepPartialify(schema) {
		if (schema instanceof ZodObject) {
			const newShape = {};
			for (const key in schema.shape) {
				const fieldSchema = schema.shape[key];
				newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
			}
			return new ZodObject({
				...schema._def,
				shape: () => newShape
			});
		} else if (schema instanceof ZodArray) return new ZodArray({
			...schema._def,
			type: deepPartialify(schema.element)
		});
		else if (schema instanceof ZodOptional) return ZodOptional.create(deepPartialify(schema.unwrap()));
		else if (schema instanceof ZodNullable) return ZodNullable.create(deepPartialify(schema.unwrap()));
		else if (schema instanceof ZodTuple) return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
		else return schema;
	}
	var ZodObject = class ZodObject extends ZodType {
		constructor() {
			super(...arguments);
			this._cached = null;
			this.nonstrict = this.passthrough;
			this.augment = this.extend;
		}
		_getCached() {
			if (this._cached !== null) return this._cached;
			const shape = this._def.shape();
			const keys = util.objectKeys(shape);
			this._cached = {
				shape,
				keys
			};
			return this._cached;
		}
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.object) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const { status, ctx } = this._processInputParams(input);
			const { shape, keys: shapeKeys } = this._getCached();
			const extraKeys = [];
			if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
				for (const key in ctx.data) if (!shapeKeys.includes(key)) extraKeys.push(key);
			}
			const pairs = [];
			for (const key of shapeKeys) {
				const keyValidator = shape[key];
				const value = ctx.data[key];
				pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
					alwaysSet: key in ctx.data
				});
			}
			if (this._def.catchall instanceof ZodNever) {
				const unknownKeys = this._def.unknownKeys;
				if (unknownKeys === "passthrough") for (const key of extraKeys) pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: {
						status: "valid",
						value: ctx.data[key]
					}
				});
				else if (unknownKeys === "strict") {
					if (extraKeys.length > 0) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.unrecognized_keys,
							keys: extraKeys
						});
						status.dirty();
					}
				} else if (unknownKeys === "strip") {} else throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
			} else {
				const catchall = this._def.catchall;
				for (const key of extraKeys) {
					const value = ctx.data[key];
					pairs.push({
						key: {
							status: "valid",
							value: key
						},
						value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
						alwaysSet: key in ctx.data
					});
				}
			}
			if (ctx.common.async) return Promise.resolve().then(async () => {
				const syncPairs = [];
				for (const pair of pairs) {
					const key = await pair.key;
					const value = await pair.value;
					syncPairs.push({
						key,
						value,
						alwaysSet: pair.alwaysSet
					});
				}
				return syncPairs;
			}).then((syncPairs) => {
				return ParseStatus.mergeObjectSync(status, syncPairs);
			});
			else return ParseStatus.mergeObjectSync(status, pairs);
		}
		get shape() {
			return this._def.shape();
		}
		strict(message) {
			errorUtil.errToObj;
			return new ZodObject({
				...this._def,
				unknownKeys: "strict",
				...message !== void 0 ? { errorMap: (issue, ctx) => {
					const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
					if (issue.code === "unrecognized_keys") return { message: errorUtil.errToObj(message).message ?? defaultError };
					return { message: defaultError };
				} } : {}
			});
		}
		strip() {
			return new ZodObject({
				...this._def,
				unknownKeys: "strip"
			});
		}
		passthrough() {
			return new ZodObject({
				...this._def,
				unknownKeys: "passthrough"
			});
		}
		extend(augmentation) {
			return new ZodObject({
				...this._def,
				shape: () => ({
					...this._def.shape(),
					...augmentation
				})
			});
		}
		merge(merging) {
			return new ZodObject({
				unknownKeys: merging._def.unknownKeys,
				catchall: merging._def.catchall,
				shape: () => ({
					...this._def.shape(),
					...merging._def.shape()
				}),
				typeName: ZodFirstPartyTypeKind.ZodObject
			});
		}
		setKey(key, schema) {
			return this.augment({ [key]: schema });
		}
		catchall(index) {
			return new ZodObject({
				...this._def,
				catchall: index
			});
		}
		pick(mask) {
			const shape = {};
			for (const key of util.objectKeys(mask)) if (mask[key] && this.shape[key]) shape[key] = this.shape[key];
			return new ZodObject({
				...this._def,
				shape: () => shape
			});
		}
		omit(mask) {
			const shape = {};
			for (const key of util.objectKeys(this.shape)) if (!mask[key]) shape[key] = this.shape[key];
			return new ZodObject({
				...this._def,
				shape: () => shape
			});
		}
		deepPartial() {
			return deepPartialify(this);
		}
		partial(mask) {
			const newShape = {};
			for (const key of util.objectKeys(this.shape)) {
				const fieldSchema = this.shape[key];
				if (mask && !mask[key]) newShape[key] = fieldSchema;
				else newShape[key] = fieldSchema.optional();
			}
			return new ZodObject({
				...this._def,
				shape: () => newShape
			});
		}
		required(mask) {
			const newShape = {};
			for (const key of util.objectKeys(this.shape)) if (mask && !mask[key]) newShape[key] = this.shape[key];
			else {
				let newField = this.shape[key];
				while (newField instanceof ZodOptional) newField = newField._def.innerType;
				newShape[key] = newField;
			}
			return new ZodObject({
				...this._def,
				shape: () => newShape
			});
		}
		keyof() {
			return createZodEnum(util.objectKeys(this.shape));
		}
	};
	ZodObject.create = (shape, params) => {
		return new ZodObject({
			shape: () => shape,
			unknownKeys: "strip",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	ZodObject.strictCreate = (shape, params) => {
		return new ZodObject({
			shape: () => shape,
			unknownKeys: "strict",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	ZodObject.lazycreate = (shape, params) => {
		return new ZodObject({
			shape,
			unknownKeys: "strip",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	var ZodUnion = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const options = this._def.options;
			function handleResults(results) {
				for (const result of results) if (result.result.status === "valid") return result.result;
				for (const result of results) if (result.result.status === "dirty") {
					ctx.common.issues.push(...result.ctx.common.issues);
					return result.result;
				}
				const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union,
					unionErrors
				});
				return INVALID;
			}
			if (ctx.common.async) return Promise.all(options.map(async (option) => {
				const childCtx = {
					...ctx,
					common: {
						...ctx.common,
						issues: []
					},
					parent: null
				};
				return {
					result: await option._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: childCtx
					}),
					ctx: childCtx
				};
			})).then(handleResults);
			else {
				let dirty = void 0;
				const issues = [];
				for (const option of options) {
					const childCtx = {
						...ctx,
						common: {
							...ctx.common,
							issues: []
						},
						parent: null
					};
					const result = option._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: childCtx
					});
					if (result.status === "valid") return result;
					else if (result.status === "dirty" && !dirty) dirty = {
						result,
						ctx: childCtx
					};
					if (childCtx.common.issues.length) issues.push(childCtx.common.issues);
				}
				if (dirty) {
					ctx.common.issues.push(...dirty.ctx.common.issues);
					return dirty.result;
				}
				const unionErrors = issues.map((issues) => new ZodError(issues));
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union,
					unionErrors
				});
				return INVALID;
			}
		}
		get options() {
			return this._def.options;
		}
	};
	ZodUnion.create = (types, params) => {
		return new ZodUnion({
			options: types,
			typeName: ZodFirstPartyTypeKind.ZodUnion,
			...processCreateParams(params)
		});
	};
	const getDiscriminator = (type) => {
		if (type instanceof ZodLazy) return getDiscriminator(type.schema);
		else if (type instanceof ZodEffects) return getDiscriminator(type.innerType());
		else if (type instanceof ZodLiteral) return [type.value];
		else if (type instanceof ZodEnum) return type.options;
		else if (type instanceof ZodNativeEnum) return util.objectValues(type.enum);
		else if (type instanceof ZodDefault) return getDiscriminator(type._def.innerType);
		else if (type instanceof ZodUndefined) return [void 0];
		else if (type instanceof ZodNull) return [null];
		else if (type instanceof ZodOptional) return [void 0, ...getDiscriminator(type.unwrap())];
		else if (type instanceof ZodNullable) return [null, ...getDiscriminator(type.unwrap())];
		else if (type instanceof ZodBranded) return getDiscriminator(type.unwrap());
		else if (type instanceof ZodReadonly) return getDiscriminator(type.unwrap());
		else if (type instanceof ZodCatch) return getDiscriminator(type._def.innerType);
		else return [];
	};
	var ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.object) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const discriminator = this.discriminator;
			const discriminatorValue = ctx.data[discriminator];
			const option = this.optionsMap.get(discriminatorValue);
			if (!option) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union_discriminator,
					options: Array.from(this.optionsMap.keys()),
					path: [discriminator]
				});
				return INVALID;
			}
			if (ctx.common.async) return option._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			else return option._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
		}
		get discriminator() {
			return this._def.discriminator;
		}
		get options() {
			return this._def.options;
		}
		get optionsMap() {
			return this._def.optionsMap;
		}
		static create(discriminator, options, params) {
			const optionsMap = new Map();
			for (const type of options) {
				const discriminatorValues = getDiscriminator(type.shape[discriminator]);
				if (!discriminatorValues.length) throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
				for (const value of discriminatorValues) {
					if (optionsMap.has(value)) throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
					optionsMap.set(value, type);
				}
			}
			return new ZodDiscriminatedUnion({
				typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
				discriminator,
				options,
				optionsMap,
				...processCreateParams(params)
			});
		}
	};
	function mergeValues(a, b) {
		const aType = getParsedType(a);
		const bType = getParsedType(b);
		if (a === b) return {
			valid: true,
			data: a
		};
		else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
			const bKeys = util.objectKeys(b);
			const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
			const newObj = {
				...a,
				...b
			};
			for (const key of sharedKeys) {
				const sharedValue = mergeValues(a[key], b[key]);
				if (!sharedValue.valid) return { valid: false };
				newObj[key] = sharedValue.data;
			}
			return {
				valid: true,
				data: newObj
			};
		} else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
			if (a.length !== b.length) return { valid: false };
			const newArray = [];
			for (let index = 0; index < a.length; index++) {
				const itemA = a[index];
				const itemB = b[index];
				const sharedValue = mergeValues(itemA, itemB);
				if (!sharedValue.valid) return { valid: false };
				newArray.push(sharedValue.data);
			}
			return {
				valid: true,
				data: newArray
			};
		} else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) return {
			valid: true,
			data: a
		};
		else return { valid: false };
	}
	var ZodIntersection = class extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			const handleParsed = (parsedLeft, parsedRight) => {
				if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
				const merged = mergeValues(parsedLeft.value, parsedRight.value);
				if (!merged.valid) {
					addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
					return INVALID;
				}
				if (isDirty(parsedLeft) || isDirty(parsedRight)) status.dirty();
				return {
					status: status.value,
					value: merged.data
				};
			};
			if (ctx.common.async) return Promise.all([this._def.left._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}), this._def.right._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			})]).then(([left, right]) => handleParsed(left, right));
			else return handleParsed(this._def.left._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}), this._def.right._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}));
		}
	};
	ZodIntersection.create = (left, right, params) => {
		return new ZodIntersection({
			left,
			right,
			typeName: ZodFirstPartyTypeKind.ZodIntersection,
			...processCreateParams(params)
		});
	};
	var ZodTuple = class ZodTuple extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.array) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.array,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (ctx.data.length < this._def.items.length) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: this._def.items.length,
					inclusive: true,
					exact: false,
					type: "array"
				});
				return INVALID;
			}
			if (!this._def.rest && ctx.data.length > this._def.items.length) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: this._def.items.length,
					inclusive: true,
					exact: false,
					type: "array"
				});
				status.dirty();
			}
			const items = [...ctx.data].map((item, itemIndex) => {
				const schema = this._def.items[itemIndex] || this._def.rest;
				if (!schema) return null;
				return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
			}).filter((x) => !!x);
			if (ctx.common.async) return Promise.all(items).then((results) => {
				return ParseStatus.mergeArray(status, results);
			});
			else return ParseStatus.mergeArray(status, items);
		}
		get items() {
			return this._def.items;
		}
		rest(rest) {
			return new ZodTuple({
				...this._def,
				rest
			});
		}
	};
	ZodTuple.create = (schemas, params) => {
		if (!Array.isArray(schemas)) throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
		return new ZodTuple({
			items: schemas,
			typeName: ZodFirstPartyTypeKind.ZodTuple,
			rest: null,
			...processCreateParams(params)
		});
	};
	var ZodRecord = class ZodRecord extends ZodType {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.object) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const pairs = [];
			const keyType = this._def.keyType;
			const valueType = this._def.valueType;
			for (const key in ctx.data) pairs.push({
				key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
				value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
				alwaysSet: key in ctx.data
			});
			if (ctx.common.async) return ParseStatus.mergeObjectAsync(status, pairs);
			else return ParseStatus.mergeObjectSync(status, pairs);
		}
		get element() {
			return this._def.valueType;
		}
		static create(first, second, third) {
			if (second instanceof ZodType) return new ZodRecord({
				keyType: first,
				valueType: second,
				typeName: ZodFirstPartyTypeKind.ZodRecord,
				...processCreateParams(third)
			});
			return new ZodRecord({
				keyType: ZodString.create(),
				valueType: first,
				typeName: ZodFirstPartyTypeKind.ZodRecord,
				...processCreateParams(second)
			});
		}
	};
	var ZodMap = class extends ZodType {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.map) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.map,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const keyType = this._def.keyType;
			const valueType = this._def.valueType;
			const pairs = [...ctx.data.entries()].map(([key, value], index) => {
				return {
					key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
					value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
				};
			});
			if (ctx.common.async) {
				const finalMap = new Map();
				return Promise.resolve().then(async () => {
					for (const pair of pairs) {
						const key = await pair.key;
						const value = await pair.value;
						if (key.status === "aborted" || value.status === "aborted") return INVALID;
						if (key.status === "dirty" || value.status === "dirty") status.dirty();
						finalMap.set(key.value, value.value);
					}
					return {
						status: status.value,
						value: finalMap
					};
				});
			} else {
				const finalMap = new Map();
				for (const pair of pairs) {
					const key = pair.key;
					const value = pair.value;
					if (key.status === "aborted" || value.status === "aborted") return INVALID;
					if (key.status === "dirty" || value.status === "dirty") status.dirty();
					finalMap.set(key.value, value.value);
				}
				return {
					status: status.value,
					value: finalMap
				};
			}
		}
	};
	ZodMap.create = (keyType, valueType, params) => {
		return new ZodMap({
			valueType,
			keyType,
			typeName: ZodFirstPartyTypeKind.ZodMap,
			...processCreateParams(params)
		});
	};
	var ZodSet = class ZodSet extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.set) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.set,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const def = this._def;
			if (def.minSize !== null) {
				if (ctx.data.size < def.minSize.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: def.minSize.value,
						type: "set",
						inclusive: true,
						exact: false,
						message: def.minSize.message
					});
					status.dirty();
				}
			}
			if (def.maxSize !== null) {
				if (ctx.data.size > def.maxSize.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: def.maxSize.value,
						type: "set",
						inclusive: true,
						exact: false,
						message: def.maxSize.message
					});
					status.dirty();
				}
			}
			const valueType = this._def.valueType;
			function finalizeSet(elements) {
				const parsedSet = new Set();
				for (const element of elements) {
					if (element.status === "aborted") return INVALID;
					if (element.status === "dirty") status.dirty();
					parsedSet.add(element.value);
				}
				return {
					status: status.value,
					value: parsedSet
				};
			}
			const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
			if (ctx.common.async) return Promise.all(elements).then((elements) => finalizeSet(elements));
			else return finalizeSet(elements);
		}
		min(minSize, message) {
			return new ZodSet({
				...this._def,
				minSize: {
					value: minSize,
					message: errorUtil.toString(message)
				}
			});
		}
		max(maxSize, message) {
			return new ZodSet({
				...this._def,
				maxSize: {
					value: maxSize,
					message: errorUtil.toString(message)
				}
			});
		}
		size(size, message) {
			return this.min(size, message).max(size, message);
		}
		nonempty(message) {
			return this.min(1, message);
		}
	};
	ZodSet.create = (valueType, params) => {
		return new ZodSet({
			valueType,
			minSize: null,
			maxSize: null,
			typeName: ZodFirstPartyTypeKind.ZodSet,
			...processCreateParams(params)
		});
	};
	var ZodFunction = class ZodFunction extends ZodType {
		constructor() {
			super(...arguments);
			this.validate = this.implement;
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.function) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.function,
					received: ctx.parsedType
				});
				return INVALID;
			}
			function makeArgsIssue(args, error) {
				return makeIssue({
					data: args,
					path: ctx.path,
					errorMaps: [
						ctx.common.contextualErrorMap,
						ctx.schemaErrorMap,
						getErrorMap(),
						errorMap
					].filter((x) => !!x),
					issueData: {
						code: ZodIssueCode.invalid_arguments,
						argumentsError: error
					}
				});
			}
			function makeReturnsIssue(returns, error) {
				return makeIssue({
					data: returns,
					path: ctx.path,
					errorMaps: [
						ctx.common.contextualErrorMap,
						ctx.schemaErrorMap,
						getErrorMap(),
						errorMap
					].filter((x) => !!x),
					issueData: {
						code: ZodIssueCode.invalid_return_type,
						returnTypeError: error
					}
				});
			}
			const params = { errorMap: ctx.common.contextualErrorMap };
			const fn = ctx.data;
			if (this._def.returns instanceof ZodPromise) {
				const me = this;
				return OK(async function(...args) {
					const error = new ZodError([]);
					const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
						error.addIssue(makeArgsIssue(args, e));
						throw error;
					});
					const result = await Reflect.apply(fn, this, parsedArgs);
					return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
						error.addIssue(makeReturnsIssue(result, e));
						throw error;
					});
				});
			} else {
				const me = this;
				return OK(function(...args) {
					const parsedArgs = me._def.args.safeParse(args, params);
					if (!parsedArgs.success) throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
					const result = Reflect.apply(fn, this, parsedArgs.data);
					const parsedReturns = me._def.returns.safeParse(result, params);
					if (!parsedReturns.success) throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
					return parsedReturns.data;
				});
			}
		}
		parameters() {
			return this._def.args;
		}
		returnType() {
			return this._def.returns;
		}
		args(...items) {
			return new ZodFunction({
				...this._def,
				args: ZodTuple.create(items).rest(ZodUnknown.create())
			});
		}
		returns(returnType) {
			return new ZodFunction({
				...this._def,
				returns: returnType
			});
		}
		implement(func) {
			return this.parse(func);
		}
		strictImplement(func) {
			return this.parse(func);
		}
		static create(args, returns, params) {
			return new ZodFunction({
				args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
				returns: returns || ZodUnknown.create(),
				typeName: ZodFirstPartyTypeKind.ZodFunction,
				...processCreateParams(params)
			});
		}
	};
	var ZodLazy = class extends ZodType {
		get schema() {
			return this._def.getter();
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			return this._def.getter()._parse({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
		}
	};
	ZodLazy.create = (getter, params) => {
		return new ZodLazy({
			getter,
			typeName: ZodFirstPartyTypeKind.ZodLazy,
			...processCreateParams(params)
		});
	};
	var ZodLiteral = class extends ZodType {
		_parse(input) {
			if (input.data !== this._def.value) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_literal,
					expected: this._def.value
				});
				return INVALID;
			}
			return {
				status: "valid",
				value: input.data
			};
		}
		get value() {
			return this._def.value;
		}
	};
	ZodLiteral.create = (value, params) => {
		return new ZodLiteral({
			value,
			typeName: ZodFirstPartyTypeKind.ZodLiteral,
			...processCreateParams(params)
		});
	};
	function createZodEnum(values, params) {
		return new ZodEnum({
			values,
			typeName: ZodFirstPartyTypeKind.ZodEnum,
			...processCreateParams(params)
		});
	}
	var ZodEnum = class ZodEnum extends ZodType {
		_parse(input) {
			if (typeof input.data !== "string") {
				const ctx = this._getOrReturnCtx(input);
				const expectedValues = this._def.values;
				addIssueToContext(ctx, {
					expected: util.joinValues(expectedValues),
					received: ctx.parsedType,
					code: ZodIssueCode.invalid_type
				});
				return INVALID;
			}
			if (!this._cache) this._cache = new Set(this._def.values);
			if (!this._cache.has(input.data)) {
				const ctx = this._getOrReturnCtx(input);
				const expectedValues = this._def.values;
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_enum_value,
					options: expectedValues
				});
				return INVALID;
			}
			return OK(input.data);
		}
		get options() {
			return this._def.values;
		}
		get enum() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		get Values() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		get Enum() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		extract(values, newDef = this._def) {
			return ZodEnum.create(values, {
				...this._def,
				...newDef
			});
		}
		exclude(values, newDef = this._def) {
			return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
				...this._def,
				...newDef
			});
		}
	};
	ZodEnum.create = createZodEnum;
	var ZodNativeEnum = class extends ZodType {
		_parse(input) {
			const nativeEnumValues = util.getValidEnumValues(this._def.values);
			const ctx = this._getOrReturnCtx(input);
			if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
				const expectedValues = util.objectValues(nativeEnumValues);
				addIssueToContext(ctx, {
					expected: util.joinValues(expectedValues),
					received: ctx.parsedType,
					code: ZodIssueCode.invalid_type
				});
				return INVALID;
			}
			if (!this._cache) this._cache = new Set(util.getValidEnumValues(this._def.values));
			if (!this._cache.has(input.data)) {
				const expectedValues = util.objectValues(nativeEnumValues);
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_enum_value,
					options: expectedValues
				});
				return INVALID;
			}
			return OK(input.data);
		}
		get enum() {
			return this._def.values;
		}
	};
	ZodNativeEnum.create = (values, params) => {
		return new ZodNativeEnum({
			values,
			typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
			...processCreateParams(params)
		});
	};
	var ZodPromise = class extends ZodType {
		unwrap() {
			return this._def.type;
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.promise,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
			return OK(promisified.then((data) => {
				return this._def.type.parseAsync(data, {
					path: ctx.path,
					errorMap: ctx.common.contextualErrorMap
				});
			}));
		}
	};
	ZodPromise.create = (schema, params) => {
		return new ZodPromise({
			type: schema,
			typeName: ZodFirstPartyTypeKind.ZodPromise,
			...processCreateParams(params)
		});
	};
	var ZodEffects = class extends ZodType {
		innerType() {
			return this._def.schema;
		}
		sourceType() {
			return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			const effect = this._def.effect || null;
			const checkCtx = {
				addIssue: (arg) => {
					addIssueToContext(ctx, arg);
					if (arg.fatal) status.abort();
					else status.dirty();
				},
				get path() {
					return ctx.path;
				}
			};
			checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
			if (effect.type === "preprocess") {
				const processed = effect.transform(ctx.data, checkCtx);
				if (ctx.common.async) return Promise.resolve(processed).then(async (processed) => {
					if (status.value === "aborted") return INVALID;
					const result = await this._def.schema._parseAsync({
						data: processed,
						path: ctx.path,
						parent: ctx
					});
					if (result.status === "aborted") return INVALID;
					if (result.status === "dirty") return DIRTY(result.value);
					if (status.value === "dirty") return DIRTY(result.value);
					return result;
				});
				else {
					if (status.value === "aborted") return INVALID;
					const result = this._def.schema._parseSync({
						data: processed,
						path: ctx.path,
						parent: ctx
					});
					if (result.status === "aborted") return INVALID;
					if (result.status === "dirty") return DIRTY(result.value);
					if (status.value === "dirty") return DIRTY(result.value);
					return result;
				}
			}
			if (effect.type === "refinement") {
				const executeRefinement = (acc) => {
					const result = effect.refinement(acc, checkCtx);
					if (ctx.common.async) return Promise.resolve(result);
					if (result instanceof Promise) throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
					return acc;
				};
				if (ctx.common.async === false) {
					const inner = this._def.schema._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (inner.status === "aborted") return INVALID;
					if (inner.status === "dirty") status.dirty();
					executeRefinement(inner.value);
					return {
						status: status.value,
						value: inner.value
					};
				} else return this._def.schema._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}).then((inner) => {
					if (inner.status === "aborted") return INVALID;
					if (inner.status === "dirty") status.dirty();
					return executeRefinement(inner.value).then(() => {
						return {
							status: status.value,
							value: inner.value
						};
					});
				});
			}
			if (effect.type === "transform") {
				if (ctx.common.async === false) {
					const base = this._def.schema._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (!isValid(base)) return INVALID;
					const result = effect.transform(base.value, checkCtx);
					if (result instanceof Promise) throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
					return {
						status: status.value,
						value: result
					};
				} else return this._def.schema._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}).then((base) => {
					if (!isValid(base)) return INVALID;
					return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
						status: status.value,
						value: result
					}));
				});
			}
			util.assertNever(effect);
		}
	};
	ZodEffects.create = (schema, effect, params) => {
		return new ZodEffects({
			schema,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect,
			...processCreateParams(params)
		});
	};
	ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
		return new ZodEffects({
			schema,
			effect: {
				type: "preprocess",
				transform: preprocess
			},
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			...processCreateParams(params)
		});
	};
	var ZodOptional = class extends ZodType {
		_parse(input) {
			if (this._getType(input) === ZodParsedType.undefined) return OK(void 0);
			return this._def.innerType._parse(input);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodOptional.create = (type, params) => {
		return new ZodOptional({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodOptional,
			...processCreateParams(params)
		});
	};
	var ZodNullable = class extends ZodType {
		_parse(input) {
			if (this._getType(input) === ZodParsedType.null) return OK(null);
			return this._def.innerType._parse(input);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodNullable.create = (type, params) => {
		return new ZodNullable({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodNullable,
			...processCreateParams(params)
		});
	};
	var ZodDefault = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			let data = ctx.data;
			if (ctx.parsedType === ZodParsedType.undefined) data = this._def.defaultValue();
			return this._def.innerType._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
		}
		removeDefault() {
			return this._def.innerType;
		}
	};
	ZodDefault.create = (type, params) => {
		return new ZodDefault({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodDefault,
			defaultValue: typeof params.default === "function" ? params.default : () => params.default,
			...processCreateParams(params)
		});
	};
	var ZodCatch = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const newCtx = {
				...ctx,
				common: {
					...ctx.common,
					issues: []
				}
			};
			const result = this._def.innerType._parse({
				data: newCtx.data,
				path: newCtx.path,
				parent: { ...newCtx }
			});
			if (isAsync(result)) return result.then((result) => {
				return {
					status: "valid",
					value: result.status === "valid" ? result.value : this._def.catchValue({
						get error() {
							return new ZodError(newCtx.common.issues);
						},
						input: newCtx.data
					})
				};
			});
			else return {
				status: "valid",
				value: result.status === "valid" ? result.value : this._def.catchValue({
					get error() {
						return new ZodError(newCtx.common.issues);
					},
					input: newCtx.data
				})
			};
		}
		removeCatch() {
			return this._def.innerType;
		}
	};
	ZodCatch.create = (type, params) => {
		return new ZodCatch({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodCatch,
			catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
			...processCreateParams(params)
		});
	};
	var ZodNaN = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.nan) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.nan,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return {
				status: "valid",
				value: input.data
			};
		}
	};
	ZodNaN.create = (params) => {
		return new ZodNaN({
			typeName: ZodFirstPartyTypeKind.ZodNaN,
			...processCreateParams(params)
		});
	};
	var ZodBranded = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const data = ctx.data;
			return this._def.type._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
		}
		unwrap() {
			return this._def.type;
		}
	};
	var ZodPipeline = class ZodPipeline extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.common.async) {
				const handleAsync = async () => {
					const inResult = await this._def.in._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (inResult.status === "aborted") return INVALID;
					if (inResult.status === "dirty") {
						status.dirty();
						return DIRTY(inResult.value);
					} else return this._def.out._parseAsync({
						data: inResult.value,
						path: ctx.path,
						parent: ctx
					});
				};
				return handleAsync();
			} else {
				const inResult = this._def.in._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inResult.status === "aborted") return INVALID;
				if (inResult.status === "dirty") {
					status.dirty();
					return {
						status: "dirty",
						value: inResult.value
					};
				} else return this._def.out._parseSync({
					data: inResult.value,
					path: ctx.path,
					parent: ctx
				});
			}
		}
		static create(a, b) {
			return new ZodPipeline({
				in: a,
				out: b,
				typeName: ZodFirstPartyTypeKind.ZodPipeline
			});
		}
	};
	var ZodReadonly = class extends ZodType {
		_parse(input) {
			const result = this._def.innerType._parse(input);
			const freeze = (data) => {
				if (isValid(data)) data.value = Object.freeze(data.value);
				return data;
			};
			return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodReadonly.create = (type, params) => {
		return new ZodReadonly({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodReadonly,
			...processCreateParams(params)
		});
	};
	ZodObject.lazycreate;
	var ZodFirstPartyTypeKind;
	(function(ZodFirstPartyTypeKind) {
		ZodFirstPartyTypeKind["ZodString"] = "ZodString";
		ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
		ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
		ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
		ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
		ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
		ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
		ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
		ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
		ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
		ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
		ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
		ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
		ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
		ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
		ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
		ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
		ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
		ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
		ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
		ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
		ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
		ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
		ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
		ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
		ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
		ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
		ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
		ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
		ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
		ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
		ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
		ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
		ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
		ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
		ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
	})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
	const stringType = ZodString.create;
	const numberType = ZodNumber.create;
	ZodNaN.create;
	ZodBigInt.create;
	const booleanType = ZodBoolean.create;
	ZodDate.create;
	ZodSymbol.create;
	ZodUndefined.create;
	ZodNull.create;
	ZodAny.create;
	const unknownType = ZodUnknown.create;
	ZodNever.create;
	ZodVoid.create;
	const arrayType = ZodArray.create;
	const objectType = ZodObject.create;
	ZodObject.strictCreate;
	const unionType = ZodUnion.create;
	const discriminatedUnionType = ZodDiscriminatedUnion.create;
	ZodIntersection.create;
	const tupleType = ZodTuple.create;
	const recordType = ZodRecord.create;
	ZodMap.create;
	ZodSet.create;
	ZodFunction.create;
	ZodLazy.create;
	const literalType = ZodLiteral.create;
	const enumType = ZodEnum.create;
	ZodNativeEnum.create;
	ZodPromise.create;
	ZodEffects.create;
	ZodOptional.create;
	ZodNullable.create;
	ZodEffects.createWithPreprocess;
	ZodPipeline.create;
	const DEFAULTS = {
		mcpPort: 39742,
		screenshotMaxEdge: 256,
		screenshotMaxEdgeCap: 1024,
		screenshotQuality: 70,
		screenshotFormat: "jpeg",
		textureSize: 64
	};
	objectType({
		code: enumType([
			"E_PLUGIN_DISCONNECTED",
			"E_SECRET_MISSING",
			"E_AUTH_FAILED",
			"E_PROTOCOL_MISMATCH",
			"E_TIMEOUT",
			"E_INVALID_PARAM",
			"E_UNKNOWN_PARAM",
			"E_UNSUPPORTED_FORMAT",
			"E_UNSUPPORTED_COMMAND",
			"E_SCOPE_DENIED",
			"E_PARTIAL_FORBIDDEN",
			"E_NOT_FOUND",
			"E_BLOCKBENCH_ERROR"
		]),
		message: stringType(),
		details: unknownType().optional()
	}).strict();
	function makeError(code, message, details) {
		return details === void 0 ? {
			code,
			message
		} : {
			code,
			message,
			details
		};
	}
	const VIEW_PRESETS = [
		"north",
		"south",
		"east",
		"west",
		"up",
		"down",
		"iso"
	];
	tupleType([
		numberType(),
		numberType(),
		numberType()
	]);
	arrayType(enumType([
		"geometry",
		"textures",
		"screenshots",
		"animations",
		"geckolib",
		"filesystem",
		"painter"
	]));
	function parseSemverParts(v) {
		const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
		if (!m) return [
			0,
			0,
			0
		];
		return [
			Number(m[1]),
			Number(m[2]),
			Number(m[3])
		];
	}
	const MIN_BLOCKBENCH_VERSION = "5.1.0";
	function isBlockbenchSupported(version) {
		const [a, b, c] = parseSemverParts(version);
		const [A, B, C] = parseSemverParts(MIN_BLOCKBENCH_VERSION);
		if (a !== A) return a > A;
		if (b !== B) return b > B;
		return c >= C;
	}
	//#endregion
	//#region ../shared/dist/contracts.js
	const vec3Schema = tupleType([
		numberType(),
		numberType(),
		numberType()
	]);
	tupleType([numberType(), numberType()]);
	const paintOpSchema = discriminatedUnionType("type", [
		objectType({
			type: literalType("fill"),
			color: stringType()
		}),
		objectType({
			type: literalType("rect"),
			x: numberType(),
			y: numberType(),
			width: numberType(),
			height: numberType(),
			color: stringType()
		}),
		objectType({
			type: literalType("ellipse"),
			x: numberType(),
			y: numberType(),
			width: numberType(),
			height: numberType(),
			color: stringType()
		}),
		objectType({
			type: literalType("line"),
			x: numberType(),
			y: numberType(),
			x2: numberType(),
			y2: numberType(),
			width: numberType().optional(),
			color: stringType()
		})
	]);
	const faceFeatureSchema = objectType({
		cube: stringType(),
		face: enumType([
			"north",
			"south",
			"east",
			"west",
			"up",
			"down"
		]),
		ops: arrayType(paintOpSchema)
	});
	objectType({
		texture: stringType().optional(),
		faces: arrayType(faceFeatureSchema)
	});
	objectType({
		texture: stringType().optional(),
		cube: stringType(),
		face: enumType([
			"north",
			"south",
			"east",
			"west",
			"up",
			"down"
		]),
		rows: arrayType(stringType()),
		palette: recordType(stringType(), stringType()),
		expected_revision: stringType().optional()
	});
	objectType({
		refs: arrayType(stringType()),
		translate: vec3Schema.optional(),
		scale: vec3Schema.optional(),
		pivot: vec3Schema.optional(),
		rotate: vec3Schema.optional(),
		uv_policy: enumType(["preserve", "auto"]).optional()
	});
	objectType({
		matrix: arrayType(stringType().min(1)),
		palette: recordType(stringType().length(1), objectType({
			name: stringType().optional(),
			depth: numberType().optional(),
			offset_z: numberType().optional(),
			inflate: numberType().optional()
		})).optional(),
		pixel_size: numberType().positive().optional(),
		plane: enumType([
			"xy",
			"xz",
			"yz"
		]).optional(),
		origin: vec3Schema.optional(),
		parent: stringType().optional(),
		merge_adjacent: booleanType().optional(),
		max_cubes: numberType().int().positive().optional(),
		z_fight_guard: booleanType().optional()
	});
	objectType({ allow_overlaps: arrayType(objectType({
		a: stringType(),
		b: stringType()
	})).optional() });
	objectType({
		views: arrayType(enumType(VIEW_PRESETS)).optional(),
		max_edge: numberType().int().positive().optional(),
		format: enumType(["png", "jpeg"]).optional(),
		quality: numberType().min(10).max(100).optional()
	});
	objectType({
		texture: stringType().optional(),
		max_edge: numberType().int().positive().optional()
	});
	objectType({
		path: stringType(),
		overwrite: booleanType().optional(),
		codec: stringType().optional(),
		format: stringType().optional(),
		options: recordType(unknownType()).optional()
	});
	//#endregion
	//#region ../shared/dist/guides.js
	const GUIDE_MODELING = `
# Modeling (Blockbench 5.1+)

## Mandatory workflow
1. health + get_project_summary first: read format and uv_mode before touching anything.
2. create_project(format, uv_mode, texture_width/height). java_block => face UV. Bedrock/GeckoLib => box or face, preserve the reference project's mode.
3. Entities: scaffold_biped first (real joint pivots). Props/blocks: apply_geometry_batch for the primary masses.
4. check_model immediately. Fix every error BEFORE texturing.
5. Add density with the generators, not by hand-computing coordinates:
   - add_hollow_volume: hoods, helmets, armour shells, cages (a shell with a real cavity)
   - generate_array: hems, scales, plates, teeth, spikes, rivets, fence posts (depth_stagger >= 0.05 stops z-fighting)
   - extrude_chain: horns, tails, tentacles, braids (create_bones:true so it animates)
   - add_wing: complete bat/dragon wing with continuous membrane
   - voxelize_matrix: draw a silhouette as pixel art; blades, emblems, fins, keys
6. measure_model instead of hand-calculating extents (accounts for rotations). audit_symmetry for explicit left/right pairs. transform_elements for relative edits.
7. Texturing: pack_box_uv -> shade_model_base -> paint_face_features. Re-check get_uv_layout before painting.
8. capture_views only after check_model is clean. Then fix what you SEE and repeat.

## UV mode (never mix blindly)
- Read uv_mode from health / get_project_summary.
- java_block => per-face (face). Bedrock supports box or face. GeckoLib/skin => box.
- pack_box_uv / auto_uv_cubes follow Project/Format; override only with mode box|face.

## Proportions & hygiene
- Even integer sizes (2/4/6/8). Silhouette first; 8-20 well-placed cubes beat 80 random ones.
- Biped scale=1: head 8^3, body 8x12x4, limbs 4x12x4, feet on y=0.
- Bone origins sit ON the joint (hip top / shoulder / neck). A pivot in the middle makes limbs spin like propellers.
- Hierarchy: root -> body -> head / arm_* / leg_*. Animate bones, never loose cubes.
- Cube budget: prop 30-60, mob 100-180, hero 180-300+. audit_complexity enforces it.
`.trim();
	const GUIDE_ORIENTATION = `
# Orientation & rotation signs (the #1 source of wrong models)

- A Minecraft model faces -Z. Its OWN right is +X, its left is -X.
- A front-view render shows the model MIRRORED: its right hand appears on the LEFT of the image, exactly like facing a person.
- +X rotation lifts a bone's front: a DOWN-pointing bone (arm/leg) swings its tip FORWARD; an UP-pointing bone (torso/neck) tips BACKWARD.
- Elbows bend +X, knees bend -X. +Y turns the model toward its own left.
- Pass side:"left"|"right" to apply_geometry_batch / generators: the tool REJECTS a call whose coordinates contradict the declared side.
- Call which_side / check_sides instead of guessing from a picture.
`.trim();
	const GUIDE_DETAILING = `
# Detailing doctrine (fixes "AI models are 15 flat boxes")

1. Blockout: primary masses only, check_model clean.
2. Layering: never one cube per body part. A large mass needs >= 4 smaller pieces on/over it.
3. Four layers per major form: (a) core mass, (b) shell/overlay, (c) surface detail (edges, trims, straps), (d) micro detail (rivets, stitches, scales).
4. Silhouette breakers: horns, ears, tails, cloth, plates. Anything that makes the outline interesting.
5. Anti z-fighting: overlapping cubes must clearly penetrate (>= 0.1) or be staggered; never align two faces to the same coordinate.
6. Run audit_complexity before texturing. verdict too_primitive means a blockout wearing a costume — keep building.
`.trim();
	const GUIDE_TEXTURING = `
# Texturing

1. ensure_texture (64 for entities, 16 for blocks) then pack_box_uv (subset packing preserves other islands).
2. get_uv_layout: require out_of_bounds = 0, review every overlap, compare density across related faces.
3. get_uv_map to visually confirm island placement, orientation and flips.
4. Fast base: shade_model_base (regions per name pattern, top lighting, mottle). Set crisp:true for pixel art.
5. Authored work: call get_texture_revision before a long plan and pass expected_revision to precision mutations — a stale plan then fails instead of overwriting newer paint.
6. paint_face_grid writes an exact palette-indexed grid (rows must match the face exactly, null = transparent). get_face_grid reads the same orientation back.
7. paint_face_features / paint_pixel_batch for accents; edit_texture_pixels for surgical RGBA edits; replace_texture_color for palette revisions; copy_face_pixels for mirrored parts.
8. flood_fill_texture only with a face or a conservative max_pixels. transform_texture_region for lossless flips/turns.
9. Finish with analyze_texture_palette + audit_texture_quality (glass:true for transparent materials), then check_model again.
10. PNG import/export requires propose_scoped_directory and stays inside that user-approved folder.
`.trim();
	const GUIDE_ANIMATION = `
# Animation

1. Rig first (scaffold_biped / create_limb / extrude_chain create_bones:true). Never keyframe loose cubes.
2. generate_animation writes a complete direction-correct base cycle: idle, walk, run, attack, cast, jump, hurt, death, fly.
   - Elbows bend +X, knees bend -X, +X swings a hanging limb forward.
   - Walk/run use opposite-phase limbs, body counter-rotation, follow-through, seamless loop.
3. inspect_animation reads exact keys before revising. transform_animation_keys retimes / scales / mirrors keys.
4. upsert_animation(replace:true) for a full replacement.
5. set_timeline_time to pose a frame, then capture_views to LOOK at it.
6. Finish with check_model + capture_views; do not claim an animation is done from the numbers alone.
`.trim();
	const GUIDE_REVIEW = `
# Human review

Work is not done because you looked at your own screenshot.

- ask_user: a decision that is genuinely the user's (which hand holds the shield, which palette).
- request_review: a milestone (blockout, texture pass, each animation) — the user presses Approve / Needs changes.
- Both return pending:true with a review_id if the user has not answered yet; keep calling wait_review with that id.
  pending is NOT approval, and neither is a timeout.
- Run the objective gates (check_model / check_sides / check_rig / audit_complexity) BEFORE asking for attention.
`.trim();
	const GUIDE_REFERENCE = `
# Reference matching

1. The user may drop a reference image into the MCP panel (or you load_reference from a path/data URL).
2. get_reference returns it as an inline image — actually LOOK at it, and re-look during the build.
3. compare_reference renders your model from the same angle, extracts both silhouettes, normalises them and returns
   match_percent (IoU), aspect_delta_pct, ref_only_pct (missing mass), model_only_pct (extra mass) and a composite image.
4. Iterate until match_percent >= 85. Do not declare a match by eye.
5. measure_model gives the numbers behind the silhouette (width:height, depth:height, head fraction).
`.trim();
	const GUIDE_VFX = `
# Pixel VFX

- A flat two-sided plane is the building block: use add_wing/voxelize_matrix or apply_geometry_batch with a zero-depth cube.
- Give the plane render_sides "double" (set_texture_render_mode) so it is visible from both sides.
- Palette: 3-5 colors with a hard alpha cutout for flames/energy/slashes. No smooth gradients in pixel VFX.
- Parent each sheet to a bone so it animates. animation with step interpolation for a strobing flame.
`.trim();
	const GUIDE_TOPICS = [
		"modeling",
		"detailing",
		"orientation",
		"texturing",
		"vfx",
		"animation",
		"review",
		"reference"
	];
	const GUIDES = {
		modeling: GUIDE_MODELING,
		detailing: GUIDE_DETAILING,
		orientation: GUIDE_ORIENTATION,
		texturing: GUIDE_TEXTURING,
		vfx: GUIDE_VFX,
		animation: GUIDE_ANIMATION,
		review: GUIDE_REVIEW,
		reference: GUIDE_REFERENCE
	};
	function resolveGuide(topic) {
		const key = topic ?? "modeling";
		if (!(key in GUIDES)) return {
			topic: "modeling",
			text: GUIDES.modeling
		};
		return {
			topic: key,
			text: GUIDES[key]
		};
	}
	//#endregion
	//#region ../shared/dist/catalogue.js
	const N = numberType();
	const S = stringType();
	const B = booleanType();
	const vec3 = tupleType([
		N,
		N,
		N
	]);
	const vec2 = tupleType([N, N]);
	const face = enumType([
		"north",
		"south",
		"east",
		"west",
		"up",
		"down"
	]);
	const textureRef$1 = S.optional();
	const spec = (name, group, description, params = objectType({}).strict(), flags = {}) => [name, {
		name,
		group,
		description,
		params,
		...flags
	}];
	const TOOL_SPECS = Object.fromEntries([
		spec("health", "status", "Plugin MCP status: listening port, protocol version, Blockbench version, current format, uv_mode and probed capabilities. Call this first.", objectType({}).strict()),
		spec("get_guide", "status", `Return a playbook. topic: ${GUIDE_TOPICS.map((t) => `'${t}'`).join(" | ")} (default modeling). READ the relevant topic BEFORE building/rigging/texturing/animating — it is the difference between a detailed model and 15 flat boxes.`, objectType({ topic: enumType(GUIDE_TOPICS).optional() }).strict()),
		spec("list_formats", "status", "List every model format available in this Blockbench install (id, name, box_uv). Use ids with create_project.", objectType({}).strict()),
		spec("get_project_summary", "status", "Compact observation of the open project: format, uv_mode, name, texture size, counts, and the outliner tree (uuid/name/type/parent). Prefer this over screenshots for orientation.", objectType({}).strict()),
		spec("get_elements", "status", "Read exact geometry: groups and cubes with uuid, name, parent, origin, rotation, from/to, inflate, visibility, box_uv, uv_offset and per-face uv/rotation/texture. The safe read-back after every mutation.", objectType({ refs: arrayType(S).optional() }).strict()),
		spec("list_textures", "status", "List textures (uuid, name, width, height).", objectType({}).strict()),
		spec("list_animations", "status", "List animations with length, loop mode, bone count and keyframe count.", objectType({}).strict()),
		spec("get_orientation", "orientation", "THE left/right authority. Returns which way the model faces, which axis is its own right/left, the front-view mirror trap, and the rotation-sign cheat sheet. Call before rigging, mirroring or interpreting a render.", objectType({}).strict()),
		spec("which_side", "orientation", "Answer 'is this bone the model's left or right?' from its COORDINATES (not from a picture), and report whether its name agrees.", objectType({ element: S }).strict()),
		spec("check_sides", "orientation", "Audit every left/right name against actual geometry: bones named arm_right sitting on the model's left, mirrored pairs that landed on the same side, limbs with no counterpart, orphan parents. Run after building or mirroring anything symmetric.", objectType({}).strict()),
		spec("create_project", "project", "Create a new project/tab from the start screen. format: list_formats id (java_block | bedrock | bedrock_old | geckolib_model). uv_mode is validated against the format before anything is created; existing tabs are preserved.", objectType({
			format: S,
			name: S.optional(),
			geometry_name: S.optional(),
			uv_mode: enumType([
				"box",
				"face",
				"auto"
			]).optional(),
			texture_width: N.optional(),
			texture_height: N.optional()
		}).strict(), { mutation: true }),
		spec("set_project_meta", "project", "Update the open project's name, geometry name or texture resolution (resolution also rescales every UV so paint stays aligned).", objectType({
			name: S.optional(),
			geometry_name: S.optional(),
			texture_width: N.optional(),
			texture_height: N.optional()
		}).strict(), { mutation: true }),
		spec("save_project", "project", "Write a real .bbmodel to disk. Requires propose_scoped_directory first; pass overwrite:true to replace an existing file.", objectType({
			path: S,
			overwrite: B.optional()
		}).strict(), { mutation: true }),
		spec("export_model", "project", "Export to a file. By default it uses the ACTIVE format's codec (Bedrock geometry JSON, Java model, GeckoLib); pass codec:'gltf' for a self-contained .gltf that imports into Godot/Unity/Blender. Requires propose_scoped_directory.", objectType({
			path: S,
			overwrite: B.optional(),
			codec: S.optional(),
			format: S.optional(),
			options: recordType(unknownType()).optional()
		}).strict(), { mutation: true }),
		spec("propose_scoped_directory", "project", "Ask the USER to approve ONE folder for AI file access this session. Every file read/write is confined to it; nothing outside is reachable. Call before save_project / export_model / PNG import-export.", objectType({ path: S }).strict()),
		spec("apply_geometry_batch", "geometry", "Create groups and cubes in ONE undo step. Parent references may point at groups created earlier in the same call (build a posed skeleton at once). The whole batch is validated before anything is written — a missing parent or a side violation fails loudly instead of half-applying. Pass side:'left'|'right' and the tool refuses coordinates that contradict it (model faces -Z so its own right is +X).", objectType({
			create_groups: arrayType(objectType({
				name: S,
				origin: vec3.optional(),
				rotation: vec3.optional(),
				parent: S.optional()
			})).optional(),
			create_cubes: arrayType(objectType({
				name: S,
				from: vec3,
				to: vec3,
				origin: vec3.optional(),
				rotation: vec3.optional(),
				inflate: N.optional(),
				parent: S.optional(),
				side: enumType(["left", "right"]).optional()
			})).optional(),
			delete_refs: arrayType(S).optional(),
			auto_uv: B.optional(),
			undo_label: S.optional()
		}).strict(), { mutation: true }),
		spec("update_elements", "geometry", "Bounded edits: rename, reparent, move origin/rotation, resize (from/to), inflate, toggle visibility. uv_policy:'auto' recomputes UVs when dimensions change. Reparenting that would create a cycle is rejected.", objectType({
			updates: arrayType(objectType({
				ref: S,
				name: S.optional(),
				parent: S.optional(),
				from: vec3.optional(),
				to: vec3.optional(),
				origin: vec3.optional(),
				rotation: vec3.optional(),
				inflate: N.optional(),
				visibility: B.optional()
			})).min(1),
			uv_policy: enumType(["preserve", "auto"]).optional()
		}).strict(), { mutation: true }),
		spec("delete_elements", "geometry", "Delete elements by uuid or name in one undo step.", objectType({ refs: arrayType(S).min(1) }).strict(), { mutation: true }),
		spec("transform_elements", "geometry", "Relative edit of a whole subtree: translate/scale/rotate around a pivot, in the selected root's parent space. Non-uniform scaling of rotated or inflated geometry is rejected (it would introduce shear) — use mirror_elements for reflection.", objectType({
			refs: arrayType(S).min(1),
			translate: vec3.optional(),
			scale: vec3.optional(),
			pivot: vec3.optional(),
			rotate: vec3.optional(),
			uv_policy: enumType(["preserve", "auto"]).optional()
		}).strict(), { mutation: true }),
		spec("mirror_elements", "geometry", "Mirror elements across an axis (default X about 0) and rename left<->right intelligently. The correct way to make a symmetric second half.", objectType({
			refs: arrayType(S).min(1),
			axis: enumType([
				"x",
				"y",
				"z"
			]).optional(),
			pivot: N.optional(),
			rename: B.optional()
		}).strict(), { mutation: true }),
		spec("array_cubes", "geometry", "Repeat cubes along a straight line with a fixed offset. uv_policy share (copy UVs) or auto (regenerate).", objectType({
			sources: arrayType(S).min(1),
			count: numberType().int().positive(),
			offset: vec3,
			name_pattern: S.optional(),
			uv_policy: enumType(["share", "auto"]).optional(),
			parent: S.optional()
		}).strict(), { mutation: true }),
		spec("radial_array_cubes", "geometry", "Repeat cubes around a circle/arc (pillars, spokes, petals, spokes of a wheel), rotating each copy about the axis.", objectType({
			sources: arrayType(S).min(1),
			count: numberType().int().positive(),
			axis: enumType([
				"x",
				"y",
				"z"
			]).optional(),
			pivot: vec3,
			angle: N.optional(),
			rotate_cubes: B.optional(),
			name_pattern: S.optional(),
			uv_policy: enumType(["share", "auto"]).optional(),
			parent: S.optional()
		}).strict(), { mutation: true }),
		spec("duplicate_hierarchy", "geometry", "Deep-copy a whole group subtree (children, grandchildren, cubes) with an optional translation — the fast way to build a mirrored or repeated limb cluster.", objectType({
			root: S,
			name_suffix: S.optional(),
			translate: vec3.optional(),
			parent: S.optional(),
			uv_policy: enumType(["share", "auto"]).optional()
		}).strict(), { mutation: true }),
		spec("create_limb", "geometry", "Create a bone + cube hanging from a real joint pivot, optionally mirrored to the other side (mirror:'x') with automatic left/right naming. Use it for arms, legs, wings, ears, tails.", objectType({
			name: S,
			parent: S.optional(),
			pivot: vec3,
			size: vec3,
			from: vec3.optional(),
			mirror: enumType(["none", "x"]).optional()
		}).strict(), { mutation: true }),
		spec("scaffold_biped", "geometry", "Build a correctly-pivoted classical biped (root -> body -> head/arms/legs, feet on y=0), pack UVs in the project's UV mode, create the skin texture, and return a check_model summary of the result. Start here for anything humanoid.", objectType({
			scale: N.optional(),
			texture_size: N.optional(),
			name_prefix: S.optional(),
			include_outer_layers: B.optional()
		}).strict(), { mutation: true }),
		spec("measure_model", "geometry", "Measurable proportions: overall bounds/centre/size, per-element bounds and volume (rotation- and hierarchy-aware), plus width:height and depth:height ratios. Use it to match a reference numerically instead of by hand.", objectType({ refs: arrayType(S).optional() }).strict()),
		spec("audit_symmetry", "geometry", "Check explicit left/right pairs of coordinates against a mirror plane and report the error in units.", objectType({
			pairs: arrayType(objectType({
				left: S,
				right: S
			})).min(1),
			axis: enumType([
				"x",
				"y",
				"z"
			]).optional(),
			pivot: N.optional(),
			tolerance: N.optional()
		}).strict()),
		spec("voxelize_matrix", "generators", "DRAW a shape as a character matrix and get 3D cubes back — the fix for parts you cannot compute [from,to] for. Universal: blades, bows, emblems, fins, keys, gears, banners. Rows are top-first; ' ' and '.' are empty. plane picks the projection: xy = front view (columns +X, rows descend -Y, depth +Z), xz = top view (rows front-to-back, depth +Y), yz = side view (columns +Z with column 0 at the model FRONT, depth +X). origin is the grid's minimum corner. merge_adjacent:true merges runs into one cube (far fewer cubes, same shape).", objectType({
			matrix: arrayType(S).min(1),
			palette: recordType(stringType(), objectType({
				name: S.optional(),
				depth: N.optional(),
				offset_z: N.optional(),
				inflate: N.optional()
			})).optional(),
			pixel_size: N.optional(),
			plane: enumType([
				"xy",
				"xz",
				"yz"
			]).optional(),
			origin: vec3,
			parent: S.optional(),
			merge_adjacent: B.optional(),
			max_cubes: N.optional(),
			z_fight_guard: B.optional()
		}).strict(), { mutation: true }),
		spec("add_hollow_volume", "generators", "Build a SHELL with a real cavity instead of a solid box — the fix for the biggest 'AI model' tell. Universal: hoods, helmets, masks, visors, breastplates, pauldrons, bracers, collars, cages, crates, pipes. open_faces takes world directions (north=-Z is the model's front, south, east=+X, west, up, down) and model-relative words (front/back/left/right/top/bottom). Walls tile exactly so they never z-fight. Returns the cavity bounds.", objectType({
			bounds: objectType({
				from: vec3,
				to: vec3
			}),
			wall_thickness: N.optional(),
			open_faces: arrayType(S).optional(),
			name: S.optional(),
			inflate: N.optional(),
			parent: S.optional(),
			side: enumType(["left", "right"]).optional()
		}).strict(), { mutation: true }),
		spec("generate_array", "generators", "Repeat one element along a line, around a ring, or over a grid: torn hems, scales, feathers, armour plates, teeth, spikes, rivets, chain links, ribs, tassels. anchor decides how each element sits on its point (center | top = hangs | bottom = stands | min). jitter breaks the machine-regular look, size_decay tapers the run, rotation_range gives each its own tilt, depth_stagger alternates neighbours in depth so shingled rows CANNOT z-fight (pass 0.05-0.2), seed makes it reproducible. Reports coincident positions to fix.", objectType({
			mode: enumType([
				"linear",
				"radial",
				"grid"
			]).optional(),
			count: N.optional(),
			element_size: vec3,
			start: vec3.optional(),
			end: vec3.optional(),
			center: vec3.optional(),
			radii: vec2.optional(),
			arc_degrees: N.optional(),
			start_degrees: N.optional(),
			align_to_center: B.optional(),
			counts: vec3.optional(),
			distribution: enumType(["span", "cells"]).optional(),
			anchor: enumType([
				"center",
				"top",
				"bottom",
				"min"
			]).optional(),
			jitter: vec3.optional(),
			size_decay: vec3.optional(),
			depth_stagger: N.optional(),
			depth_axis: enumType([
				"auto",
				"x",
				"y",
				"z",
				"radial",
				"none"
			]).optional(),
			rotation: vec3.optional(),
			rotation_range: objectType({
				min: vec3,
				max: vec3
			}).optional(),
			seed: N.optional(),
			name_prefix: S.optional(),
			parent: S.optional(),
			inflate: N.optional(),
			max_cubes: N.optional()
		}).strict(), { mutation: true }),
		spec("extrude_chain", "generators", "Build a tapering, curving chain of segments — optionally one BONE per segment so it can be animated. Universal: tentacles, horns, antlers, claws, curved tails, tusks, branches, braids, cables. Each segment is `taper` thinner and each bone adds `curvature` degrees on top of its parent, so the chain sweeps into a curve. With create_bones:true (default) the rest pose is straight and the bones produce the curve (that is what gives a tail follow-through). Returns the tip position to attach something to.", objectType({
			segments: N.optional(),
			base_origin: vec3,
			segment_length: N.optional(),
			initial_size: vec2.optional(),
			taper: N.optional(),
			length_taper: N.optional(),
			curvature: vec3.optional(),
			base_rotation: vec3.optional(),
			direction: enumType([
				"up",
				"down",
				"forward",
				"back",
				"left",
				"right"
			]).optional(),
			create_bones: B.optional(),
			name: S.optional(),
			inflate: N.optional(),
			parent: S.optional(),
			side: enumType(["left", "right"]).optional()
		}).strict(), { mutation: true }),
		spec("add_wing", "generators", "Build a complete bat / dragon / demon wing in ONE call: arm -> forearm -> a fan of finger bones plus a CONTINUOUS membrane, every panel cut from one shared outline and parented to the bone it rides on, with alternating thickness so panels never z-fight. Call once per side with the same numbers and side flipped — do not mirror a wing. Returns shoulder/elbow/wrist/tip/attach positions.", objectType({
			side: enumType(["left", "right"]),
			base_origin: vec3,
			plane: enumType(["horizontal", "vertical"]).optional(),
			fingers: N.optional(),
			arm_length: N.optional(),
			forearm_length: N.optional(),
			finger_length: unionType([N, arrayType(N)]).optional(),
			arm_angle: N.optional(),
			forearm_angle: N.optional(),
			finger_spread: vec2.optional(),
			finger_angles: arrayType(N).optional(),
			membrane: enumType(["cubes", "none"]).optional(),
			membrane_attach: vec3.optional(),
			attach_to_body: B.optional(),
			membrane_thickness: N.optional(),
			bone_thickness: N.optional(),
			name: S.optional(),
			parent: S.optional(),
			max_cubes: N.optional()
		}).strict(), { mutation: true }),
		spec("auto_uv_cubes", "uv", "Regenerate UVs for the given (or all) cubes in the resolved UV mode.", objectType({
			cubes: arrayType(S).optional(),
			mode: enumType([
				"box",
				"face",
				"auto"
			]).optional()
		}).strict(), { mutation: true }),
		spec("pack_box_uv", "uv", "Shelf-pack UV islands so no two faces share pixels. REQUIRED before texturing a box-UV model — new cubes all sit at uv_offset [0,0] and would otherwise paint onto the same pixels. Subset packing preserves other islands; auto_resize grows the atlas (power of two) while preserving paint.", objectType({
			cubes: arrayType(S).optional(),
			texture: textureRef$1,
			padding: N.optional(),
			auto_resize: B.optional(),
			mode: enumType([
				"box",
				"face",
				"auto"
			]).optional(),
			preserve_others: B.optional(),
			power_of_two: B.optional(),
			max_size: N.optional()
		}).strict(), { mutation: true }),
		spec("get_uv_layout", "uv", "Machine-readable UV islands: bounds, pixel size vs expected size, texel density, flips, rotation, texture, out-of-bounds flag, plus every overlapping pair and whether the overlap is intentional. Require out_of_bounds = 0 before painting.", objectType({
			cubes: arrayType(S).optional(),
			include_overlaps: B.optional(),
			allowed_overlaps: arrayType(objectType({
				a: S,
				b: S
			})).optional()
		}).strict()),
		spec("get_uv_map", "uv", "Labeled atlas preview (PNG) with island outlines and names — the visual check that your layout matches the texture.", objectType({
			texture: textureRef$1,
			cubes: arrayType(S).optional(),
			max_edge: N.optional(),
			labels: B.optional()
		}).strict()),
		spec("set_face_uv", "uv", "Set explicit UV rectangles (and optional 0/90/180/270 rotation) per cube face.", objectType({ entries: arrayType(objectType({
			cube: S,
			face,
			uv: tupleType([
				N,
				N,
				N,
				N
			]),
			rotation: unionType([
				literalType(0),
				literalType(90),
				literalType(180),
				literalType(270)
			]).optional()
		})).min(1) }).strict(), { mutation: true }),
		spec("transform_uv_islands", "uv", "Translate / scale / quarter-turn selected UV islands about a pivot without repacking the atlas. Refuses transforms that would leave the texture bounds.", objectType({
			faces: arrayType(objectType({
				cube: S,
				face
			})).min(1),
			translate: vec2.optional(),
			scale: vec2.optional(),
			pivot: vec2.optional(),
			rotate: enumType([
				"0",
				"90",
				"180",
				"270"
			]).optional(),
			clamp_to_texture: B.optional()
		}).strict(), { mutation: true }),
		spec("resize_texture", "uv", "Resize the bitmap and scale every UV with it (bitmap and layout stay in sync).", objectType({
			texture: textureRef$1,
			width: numberType().int().positive(),
			height: numberType().int().positive(),
			rescale_uvs: B.optional()
		}).strict(), { mutation: true }),
		spec("ensure_texture", "texture", "Create the texture if missing (optionally filled). Defaults 64x64 entities, 16x16 blocks.", objectType({
			name: S.optional(),
			width: N.optional(),
			height: N.optional(),
			fill: S.optional()
		}).strict(), { mutation: true }),
		spec("assign_texture", "texture", "Assign a texture to cubes (all faces or specific ones).", objectType({
			texture: textureRef$1,
			cubes: arrayType(S).min(1),
			faces: arrayType(face).optional()
		}).strict(), { mutation: true }),
		spec("get_texture", "texture", "Return a texture as an inline PNG image so you can SEE it (max_edge keeps context cheap).", objectType({
			texture: textureRef$1,
			max_edge: N.optional()
		}).strict()),
		spec("get_texture_revision", "texture", "Content hash of a texture. Pass it back as expected_revision to a precision mutation: if someone (or another agent) painted in the meantime the call fails instead of overwriting newer work.", objectType({ texture: textureRef$1 }).strict()),
		spec("shade_model_base", "texture", "Smooth shaded base coat on EVERY face (no bare or untextured gaps): per-face lighting, region colors matched by name regex, soft mottle and optional blur. crisp:true for pixel art (no blur). Run pack_box_uv first.", objectType({
			cubes: arrayType(S).optional(),
			texture: textureRef$1,
			base: S.optional(),
			regions: arrayType(objectType({
				match: S,
				color: S
			})).optional(),
			top_light: N.optional(),
			bottom_dark: N.optional(),
			noise: N.optional(),
			blur: N.optional(),
			edge_darken: N.optional(),
			seed: N.optional(),
			crisp: B.optional()
		}).strict(), { mutation: true }),
		spec("paint_face_features", "texture", "Paint features in FACE-RELATIVE coordinates (eyes, nose, mouth, trim, runes) with fill/rect/ellipse/line ops, honoring the face's UV rotation and flips. Whole batch = one undo step. This is the tool that stops you computing absolute UVs by hand.", objectType({
			texture: textureRef$1,
			faces: arrayType(objectType({
				cube: S,
				face,
				ops: arrayType(paintOpSchema).min(1)
			})).min(1)
		}).strict(), { mutation: true }),
		spec("paint_pixel_batch", "texture", "Face-local pixel brush strokes (paths with square or circle brushes, clipped to the face) committed as ONE undo step. Deterministic — same input, same pixels.", objectType({
			texture: textureRef$1,
			strokes: arrayType(objectType({
				cube: S,
				face,
				color: S,
				points: arrayType(objectType({
					x: N,
					y: N
				})).min(1),
				size: N.optional(),
				shape: enumType(["square", "circle"]).optional()
			})).min(1),
			clip_to_face: B.optional()
		}).strict(), { mutation: true }),
		spec("paint_face_grid", "texture", "Write an EXACT palette-indexed grid to one face. rows must match the face's texel dimensions exactly; palette values are CSS colors and null means true transparent erase. Precision pixel art in one call.", objectType({
			texture: textureRef$1,
			cube: S,
			face,
			rows: arrayType(S).min(1),
			palette: recordType(S, stringType().nullable()),
			expected_revision: S.optional()
		}).strict(), { mutation: true }),
		spec("get_face_grid", "texture", "Read a face back as exact RGBA texels in the same face-local orientation (plus the revision for read-modify-write).", objectType({
			texture: textureRef$1,
			cube: S,
			face
		}).strict()),
		spec("edit_texture_pixels", "texture", "Surgical RGBA writes: a list of {x,y,color} in atlas or face-local space. null clears to transparent.", objectType({
			texture: textureRef$1,
			expected_revision: S.optional(),
			face: objectType({
				cube: S,
				face
			}).optional(),
			pixels: arrayType(objectType({
				x: N,
				y: N,
				color: S.nullable()
			})).min(1)
		}).strict(), { mutation: true }),
		spec("replace_texture_color", "texture", "Tolerant palette revision: replace every pixel within `tolerance` of `from` with `to` (null = erase), optionally limited to one face.", objectType({
			texture: textureRef$1,
			expected_revision: S.optional(),
			face: objectType({
				cube: S,
				face
			}).optional(),
			from: S,
			to: S.nullable(),
			tolerance: N.optional()
		}).strict(), { mutation: true }),
		spec("copy_face_pixels", "texture", "Copy one face's pixels onto another, with flips and 0/90/180/270 rotation — the mirror-symmetry texture fix.", objectType({
			texture: textureRef$1,
			expected_revision: S.optional(),
			source: objectType({
				cube: S,
				face
			}),
			target: objectType({
				cube: S,
				face
			}),
			flip_x: B.optional(),
			flip_y: B.optional(),
			rotation: enumType([
				"0",
				"90",
				"180",
				"270"
			]).optional()
		}).strict(), { mutation: true }),
		spec("flood_fill_texture", "texture", "Bounded flood fill from a seed (optionally inside one face) with tolerance, diagonal option and a hard max_pixels cap so it cannot eat the atlas.", objectType({
			texture: textureRef$1,
			expected_revision: S.optional(),
			face: objectType({
				cube: S,
				face
			}).optional(),
			x: N,
			y: N,
			color: S.nullable(),
			tolerance: N.optional(),
			diagonal: B.optional(),
			max_pixels: N.optional()
		}).strict(), { mutation: true }),
		spec("transform_texture_region", "texture", "Lossless flip / 180 / quarter-turn of a region or a whole face (quarter turns require a square region).", objectType({
			texture: textureRef$1,
			expected_revision: S.optional(),
			face: objectType({
				cube: S,
				face
			}).optional(),
			rect: tupleType([
				N,
				N,
				N,
				N
			]).optional(),
			operation: enumType([
				"flip_x",
				"flip_y",
				"rotate_180",
				"rotate_90",
				"rotate_270"
			])
		}).strict(), { mutation: true }),
		spec("analyze_texture_palette", "texture", "Palette statistics: unique colors, per-color counts and percentages, transparent pixel count.", objectType({
			texture: textureRef$1,
			face: objectType({
				cube: S,
				face
			}).optional(),
			max_colors: N.optional()
		}).strict()),
		spec("get_texture_region", "texture", "Checkerboard pixel zoom of a region or face with an optional 1px grid — the way to inspect a few texels at scale.", objectType({
			texture: textureRef$1,
			face: objectType({
				cube: S,
				face
			}).optional(),
			rect: tupleType([
				N,
				N,
				N,
				N
			]).optional(),
			scale: N.optional(),
			grid: B.optional(),
			checkerboard: B.optional()
		}).strict()),
		spec("audit_texture_quality", "texture", "Turns pixel-art rules into per-face findings: palette excess, weak base coverage, isolated pixels, flat fills, and (glass:true) transparent-material edge/center alpha structure.", objectType({
			texture: textureRef$1,
			faces: arrayType(objectType({
				cube: S,
				face
			})).optional(),
			palette_limit: N.optional(),
			min_base_ratio: N.optional(),
			glass: B.optional()
		}).strict()),
		spec("import_texture_png", "texture", "Import a PNG from the scoped directory into the project (optionally replacing an existing texture with a revision check).", objectType({
			path: S,
			texture: textureRef$1,
			name: S.optional(),
			resize_project: B.optional(),
			expected_revision: S.optional()
		}).strict(), { mutation: true }),
		spec("export_texture_png", "texture", "Write a texture out as PNG into the scoped directory.", objectType({
			path: S,
			texture: textureRef$1,
			overwrite: B.optional()
		}).strict(), { mutation: true }),
		spec("ensure_material_set", "texture", "Create a consistent channel sheet set (base/emissive/normal/specular) at one size — PBR-ready naming without pretending every format exports the same material semantics.", objectType({
			prefix: S,
			width: numberType().int().positive(),
			height: numberType().int().positive(),
			channels: arrayType(enumType([
				"base",
				"emissive",
				"normal",
				"specular"
			])).min(1),
			fills: recordType(S, S).optional()
		}).strict(), { mutation: true }),
		spec("audit_material_set", "texture", "Validate channel sheets agree on dimensions, power-of-two and naming prefix before export.", objectType({
			channels: objectType({
				base: S,
				emissive: S.optional(),
				normal: S.optional(),
				specular: S.optional()
			}),
			require_power_of_two: B.optional(),
			naming_prefix: S.optional()
		}).strict()),
		spec("upsert_animation", "animation", "Create or fully replace an animation with keyframes for named bones (rotation/position/scale channels, linear/catmullrom/step interpolation). replace:true is required to overwrite an existing clip.", objectType({
			name: S,
			length: N,
			loop: enumType([
				"once",
				"hold",
				"loop"
			]).optional(),
			replace: B.optional(),
			bones: recordType(S, objectType({
				rotation: arrayType(objectType({
					time: N,
					value: vec3,
					interpolation: enumType([
						"linear",
						"catmullrom",
						"step"
					]).optional()
				})).optional(),
				position: arrayType(objectType({
					time: N,
					value: vec3,
					interpolation: enumType([
						"linear",
						"catmullrom",
						"step"
					]).optional()
				})).optional(),
				scale: arrayType(objectType({
					time: N,
					value: vec3,
					interpolation: enumType([
						"linear",
						"catmullrom",
						"step"
					]).optional()
				})).optional()
			})).optional()
		}).strict(), { mutation: true }),
		spec("generate_animation", "animation", "Write a complete, direction-correct base cycle for an existing rig: idle, walk, run, attack, cast, jump, hurt, death, fly. Applies the real rotation signs (+X swings a hanging limb forward, elbows +X, knees -X), opposite-phase limbs, body counter-rotation, follow-through and a seamless loop. Use it instead of hand-authoring 40 keyframes.", objectType({
			name: S.optional(),
			type: enumType([
				"idle",
				"walk",
				"run",
				"attack",
				"cast",
				"jump",
				"hurt",
				"death",
				"fly"
			]),
			length: N.optional(),
			bones: objectType({
				body: S.optional(),
				head: S.optional(),
				arm_left: S.optional(),
				arm_right: S.optional(),
				leg_left: S.optional(),
				leg_right: S.optional(),
				tail: S.optional(),
				wing_left: S.optional(),
				wing_right: S.optional()
			}).optional(),
			amplitude: N.optional(),
			replace: B.optional()
		}).strict(), { mutation: true }),
		spec("inspect_animation", "animation", "Read an animation's exact keys (per bone, per channel, with times and values) before revising it.", objectType({ name: S }).strict()),
		spec("transform_animation_keys", "animation", "Bounded retiming (time_scale/time_offset), value scaling and axis-aware mirroring of keyframes, optionally limited to some bones.", objectType({
			name: S,
			bones: arrayType(S).optional(),
			time_scale: N.optional(),
			time_offset: N.optional(),
			value_scale: vec3.optional(),
			mirror_axis: enumType([
				"x",
				"y",
				"z"
			]).optional()
		}).strict(), { mutation: true }),
		spec("delete_animation", "animation", "Delete an animation by name.", objectType({ name: S }).strict(), { mutation: true }),
		spec("set_timeline_time", "animation", "Pose the model at a time in the current animation so capture_views renders that frame.", objectType({
			time: N,
			animation: S.optional()
		}).strict(), { mutation: true }),
		spec("check_model", "quality", "Audit the model for what makes results look broken: empty groups, zero-volume cubes, slivers, untextured faces, out-of-bounds UVs, unintended UV overlaps, bad pivots, orphan parents, significant overlaps and COPLANAR z-fighting. Run after building and again after texturing, then fix every error.", objectType({ allow_overlaps: arrayType(objectType({
			a: S,
			b: S
		})).optional() }).strict()),
		spec("audit_complexity", "quality", "THE detail gate. Grades the model against a cube budget (prop 30-60, mob 100-180, hero 180-300+) and reports monolithic boxes, layering, micro-detail density, bare slabs, hierarchy depth and rotation. verdict too_primitive means a blockout — do not texture it yet. Run before the texturing pass.", objectType({
			target: enumType([
				"auto",
				"prop",
				"character",
				"creature",
				"hero"
			]).optional(),
			min_cubes: N.optional(),
			monolith_share: N.optional(),
			min_overlays: N.optional(),
			flat_face_area: N.optional()
		}).strict()),
		spec("check_rig", "quality", "Rig quality: two-bone limbs that will animate like cardboard, loose cubes not parented to a bone, and pivots far from the joint. Run before animating.", objectType({}).strict()),
		spec("capture_views", "views", "Render labelled orthographic views as inline images so you can LOOK at your own work and iterate. Views are named from the MODEL's point of view (front = its face; a front view is mirrored, so each capture reports which edge is the model's right). Does not move the model or the user's camera.", objectType({
			views: arrayType(enumType([
				"north",
				"south",
				"east",
				"west",
				"up",
				"down",
				"iso"
			])).optional(),
			max_edge: N.optional(),
			format: enumType(["png", "jpeg"]).optional(),
			quality: N.optional()
		}).strict()),
		spec("analyze_view_silhouette", "views", "Numeric multi-view bounds and coverage from captures: silhouette size, foreground pixels, coverage — a cheap objective check that the model is actually visible and framed.", objectType({
			views: arrayType(enumType([
				"north",
				"south",
				"east",
				"west",
				"up",
				"down",
				"iso"
			])).optional(),
			max_edge: N.optional(),
			alpha_threshold: N.optional(),
			luminance_threshold: N.optional()
		}).strict()),
		spec("set_camera_angle", "views", "Aim the viewport camera with an angle preset or an explicit position/target.", objectType({
			preset: enumType([
				"north",
				"south",
				"east",
				"west",
				"up",
				"down",
				"iso"
			]).optional(),
			position: vec3.optional(),
			target: vec3.optional()
		}).strict(), { mutation: true }),
		spec("load_reference", "reference", "Load a reference image (path inside the approved directory, or a data URL) and keep it in memory for compare_reference / get_reference. Note: it is NOT drawn as a viewport overlay — comparison is done numerically by compare_reference.", objectType({
			path: S.optional(),
			data_url: S.optional(),
			name: S.optional()
		}).strict(), { mutation: true }),
		spec("list_references", "reference", "List loaded reference images (id, name, size, source).", objectType({}).strict()),
		spec("get_reference", "reference", "Return the reference image(s) as inline images so you can actually SEE what to build.", objectType({
			name: S.optional(),
			id: S.optional()
		}).strict()),
		spec("clear_references", "reference", "Remove all loaded references and their overlays.", objectType({}).strict(), { mutation: true }),
		spec("compare_reference", "reference", "THE reference-matching tool: renders your model from the same angle, extracts both silhouettes, normalises them (so viewport framing does not matter) and returns match_percent (silhouette IoU), aspect_delta_pct, ref_only_pct (MISSING mass), model_only_pct (EXTRA mass), a verdict, concrete advice and a composite [reference | model] image. Iterate until match_percent >= 85 — do not judge by eye.", objectType({
			reference: S.optional(),
			view: enumType([
				"north",
				"south",
				"east",
				"west",
				"up",
				"down",
				"iso"
			]).optional(),
			alpha_threshold: N.optional()
		}).strict()),
		spec("ask_user", "review", "Ask the user a question through a dialog inside Blockbench and wait for the answer without ending your turn — for decisions that are genuinely theirs. Optional one-click options and reference views. Returns pending:true + review_id when unanswered; keep polling with wait_review (pending is not an answer).", objectType({
			question: S,
			title: S.optional(),
			details: S.optional(),
			options: arrayType(S).optional(),
			views: arrayType(S).optional(),
			wait_seconds: N.optional(),
			timeout_seconds: N.optional()
		}).strict()),
		spec("request_review", "review", "Show the user your current work in a dialog inside Blockbench and WAIT for their verdict (Approve / Needs changes). Call it after every user-visible milestone and before claiming a task is finished. Run the objective gates first — do not spend the user's attention on something a tool would catch. pending or a timeout is NOT approval.", objectType({
			question: S,
			title: S.optional(),
			details: S.optional(),
			views: arrayType(S).optional(),
			animation: S.optional(),
			times: arrayType(N).optional(),
			options: arrayType(S).optional(),
			wait_seconds: N.optional(),
			timeout_seconds: N.optional()
		}).strict()),
		spec("wait_review", "review", "Keep waiting for a review/question the user has not answered yet. Call in a loop with the review_id — that is how a minutes-long human review fits inside a client's request timeout.", objectType({
			review_id: S.optional(),
			wait_seconds: N.optional()
		}).strict()),
		spec("list_actions", "coverage", "Enumerate every Blockbench registered command/tool/toggle/select (the full menu + toolbar surface). Pair with run_action to reach anything without a dedicated tool.", objectType({ filter: S.optional() }).strict()),
		spec("get_action", "coverage", "Details about one Blockbench action/command by id.", objectType({ id: S }).strict()),
		spec("run_action", "coverage", "Run ANY Blockbench command by id, with an optional value for toggles/selects/sliders. Combine with select_action + list_actions for full UI coverage without a bespoke tool.", objectType({
			id: S,
			value: unknownType().optional()
		}).strict(), { mutation: true }),
		spec("select_action", "coverage", "Set what is selected in the outliner so selection-based commands act on the right elements.", objectType({
			refs: arrayType(S).min(1),
			mode: enumType(["replace", "add"]).optional()
		}).strict(), { mutation: true }),
		spec("list_modes", "coverage", "List Blockbench editor modes (edit, paint, animate, display, ...).", objectType({}).strict()),
		spec("set_mode", "coverage", "Switch the editor mode by id.", objectType({ id: S }).strict(), { mutation: true }),
		spec("list_settings", "coverage", "List Blockbench settings (id, name, value, type, category).", objectType({ category: S.optional() }).strict()),
		spec("get_setting", "coverage", "Read one Blockbench setting.", objectType({ id: S }).strict()),
		spec("set_setting", "coverage", "Write one Blockbench setting (validated by Blockbench itself).", objectType({
			id: S,
			value: unknownType()
		}).strict(), { mutation: true }),
		spec("list_plugins", "coverage", "List plugins: installed:true entries plus the store catalog the user could install (id, title, version, author, installed, disabled).", objectType({}).strict()),
		spec("install_plugin", "coverage", "Install a Blockbench plugin from the store by id (e.g. 'geckolib' before creating a geckolib_model project) or from a URL. If the entry is not installable on this platform the reason is returned instead of a silent failure.", objectType({
			id: S.optional(),
			url: S.optional()
		}).strict(), { mutation: true }),
		spec("uninstall_plugin", "coverage", "Uninstall a Blockbench plugin by id.", objectType({ id: S }).strict(), { mutation: true }),
		spec("undo", "history", "Undo the last edit (works on AI edits and user edits alike).", objectType({}).strict(), { mutation: true }),
		spec("redo", "history", "Redo the last undone edit.", objectType({}).strict(), { mutation: true }),
		spec("execute_script", "history", "Escape hatch: run arbitrary Blockbench JavaScript as the body of an async function (you may await and return a value; the full API — Cube, Group, Texture, Animation, Undo, Canvas, Project, Format, BarItems, Painter, Timeline — is in scope). Use dedicated tools where they exist. DISABLED unless the user turns on 'Allow execute_script' in Blockbench settings.", objectType({
			code: S,
			timeout_seconds: N.optional()
		}).strict(), {
			mutation: true,
			gated: true
		})
	]);
	Object.keys(TOOL_SPECS);
	[...new Set(Object.values(TOOL_SPECS).map((t) => t.group))];
	function listToolsPayload() {
		return Object.values(TOOL_SPECS).map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: zodToJsonSchemaSafe(tool.params)
		}));
	}
	function zodToJsonSchemaSafe(schema) {
		const typeName = schema._def?.typeName;
		if (typeName === "ZodObject") {
			const shape = schema.shape;
			const properties = {};
			const required = [];
			for (const [key, value] of Object.entries(shape)) {
				properties[key] = zodToJsonSchemaSafe(value);
				if (!value.isOptional()) required.push(key);
			}
			return {
				type: "object",
				properties,
				...required.length ? { required } : {}
			};
		}
		if (typeName === "ZodOptional" || typeName === "ZodDefault") {
			const inner = schema._def.innerType;
			return zodToJsonSchemaSafe(inner);
		}
		if (typeName === "ZodNullable") {
			const inner = schema._def.innerType;
			return zodToJsonSchemaSafe(inner);
		}
		if (typeName === "ZodString") return { type: "string" };
		if (typeName === "ZodNumber") return { type: (schema._def.checks ?? []).some((c) => c.kind === "int") ? "integer" : "number" };
		if (typeName === "ZodBoolean") return { type: "boolean" };
		if (typeName === "ZodLiteral") {
			const value = schema._def.value;
			return {
				const: value,
				type: typeof value
			};
		}
		if (typeName === "ZodEnum") return {
			type: "string",
			enum: schema._def.values
		};
		if (typeName === "ZodNativeEnum") return {
			type: "string",
			enum: Object.values(schema._def.values)
		};
		if (typeName === "ZodArray") {
			const inner = schema._def.type;
			return {
				type: "array",
				items: zodToJsonSchemaSafe(inner)
			};
		}
		if (typeName === "ZodTuple") return {
			type: "array",
			items: schema._def.items.map((i) => zodToJsonSchemaSafe(i))
		};
		if (typeName === "ZodRecord") {
			const value = schema._def.valueType;
			return {
				type: "object",
				additionalProperties: zodToJsonSchemaSafe(value)
			};
		}
		if (typeName === "ZodUnion" || typeName === "ZodDiscriminatedUnion") return { anyOf: (schema._def.options ?? []).map((o) => zodToJsonSchemaSafe(o)) };
		if (typeName === "ZodEffects") {
			const inner = schema._def.schema;
			return zodToJsonSchemaSafe(inner);
		}
		if (typeName === "ZodAny" || typeName === "ZodUnknown") return {};
		return {};
	}
	//#endregion
	//#region ../shared/dist/pure/vec.js
	const RAD = Math.PI / 180;
	function rotatePoint(point, pivot, rotation) {
		let [x, y, z] = [
			point[0] - pivot[0],
			point[1] - pivot[1],
			point[2] - pivot[2]
		];
		for (let axis = 0; axis < 3; axis += 1) {
			const degrees = rotation[axis] ?? 0;
			if (degrees === 0) continue;
			const r = degrees * RAD;
			const c = Math.cos(r);
			const s = Math.sin(r);
			if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
			else if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
			else [x, y] = [x * c - y * s, x * s + y * c];
		}
		return [
			x + pivot[0],
			y + pivot[1],
			z + pivot[2]
		];
	}
	function composeRotation(current, delta) {
		const columns = [
			[
				1,
				0,
				0
			],
			[
				0,
				1,
				0
			],
			[
				0,
				0,
				1
			]
		].map((axis) => rotatePoint(rotatePoint(axis, [
			0,
			0,
			0
		], current), [
			0,
			0,
			0
		], delta));
		const pitch = Math.asin(Math.max(-1, Math.min(1, -columns[0][2])));
		const regular = Math.abs(Math.cos(pitch)) > 1e-8;
		return [
			regular ? Math.atan2(columns[1][2], columns[2][2]) * 180 / Math.PI : 0,
			pitch * 180 / Math.PI,
			(regular ? Math.atan2(columns[0][1], columns[0][0]) : Math.atan2(-columns[1][0], columns[1][1])) * (180 / Math.PI)
		];
	}
	function boundsOfPoints(points) {
		if (!points.length) return {
			min: [
				0,
				0,
				0
			],
			max: [
				0,
				0,
				0
			]
		};
		return {
			min: [
				0,
				1,
				2
			].map((i) => Math.min(...points.map((p) => p[i]))),
			max: [
				0,
				1,
				2
			].map((i) => Math.max(...points.map((p) => p[i])))
		};
	}
	function boundsSize(b) {
		return [
			0,
			1,
			2
		].map((i) => b.max[i] - b.min[i]);
	}
	function boundsCenter(b) {
		return [
			0,
			1,
			2
		].map((i) => (b.min[i] + b.max[i]) / 2);
	}
	function boundsVolume(b) {
		return [
			0,
			1,
			2
		].reduce((v, i) => v * Math.max(0, b.max[i] - b.min[i]), 1);
	}
	function boundsIntersect(a, b) {
		return [
			0,
			1,
			2
		].every((i) => a.max[i] > b.min[i] && b.max[i] > a.min[i]);
	}
	function boundsIntersectionVolume(a, b) {
		let volume = 1;
		for (let i = 0; i < 3; i += 1) volume *= Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
		return volume;
	}
	function dist(a, b) {
		return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
	}
	function boxCorners(from, to, inflate = 0) {
		const lo = from.map((v, i) => Math.min(v, to[i]) - inflate);
		const hi = from.map((v, i) => Math.max(v, to[i]) + inflate);
		const out = [];
		for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push([
			x,
			y,
			z
		]);
		return out;
	}
	function geometricVolume(from, to, inflate = 0) {
		return [
			0,
			1,
			2
		].reduce((v, i) => v * Math.max(0, Math.abs(to[i] - from[i]) + inflate * 2), 1);
	}
	//#endregion
	//#region ../shared/dist/pure/color.js
	function clamp8(n) {
		return Math.max(0, Math.min(255, Math.round(n)));
	}
	const NAMED = {
		white: "#ffffff",
		black: "#000000",
		gray: "#808080",
		grey: "#808080",
		red: "#ff0000",
		green: "#008000",
		blue: "#0000ff"
	};
	function parseColor(input) {
		const s = input.trim().toLowerCase();
		const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
		if (hex3) return [
			parseInt(hex3[1] + hex3[1], 16),
			parseInt(hex3[2] + hex3[2], 16),
			parseInt(hex3[3] + hex3[3], 16),
			255
		];
		const hex6 = /^#?([0-9a-f]{6})$/.exec(s);
		if (hex6) {
			const n = parseInt(hex6[1], 16);
			return [
				n >> 16 & 255,
				n >> 8 & 255,
				n & 255,
				255
			];
		}
		const hex8 = /^#?([0-9a-f]{8})$/.exec(s);
		if (hex8) {
			const n = parseInt(hex8[1], 16);
			return [
				n >>> 24 & 255,
				n >>> 16 & 255,
				n >>> 8 & 255,
				n & 255
			];
		}
		const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
		if (rgb) return [
			clamp8(Number(rgb[1])),
			clamp8(Number(rgb[2])),
			clamp8(Number(rgb[3])),
			rgb[4] === void 0 ? 255 : clamp8(Number(rgb[4]) * 255)
		];
		const named = NAMED[s];
		if (named) return parseColor(named);
		return null;
	}
	function toHex(rgba) {
		return `#${rgba.map((v) => clamp8(v).toString(16).padStart(2, "0")).join("")}`;
	}
	function shadeHex(color, factor) {
		const rgba = parseColor(color) ?? [
			154,
			154,
			154,
			255
		];
		return toHex([
			clamp8(rgba[0] * factor),
			clamp8(rgba[1] * factor),
			clamp8(rgba[2] * factor),
			rgba[3]
		]);
	}
	function regionColorFor(name, regions, fallback) {
		if (!regions?.length) return fallback;
		for (const rule of regions) try {
			if (new RegExp(rule.match, "i").test(name)) return rule.color;
		} catch {}
		return fallback;
	}
	function makeRandom(seed = 2654435769) {
		let state = seed >>> 0;
		return () => {
			state = Math.imul(state, 1664525) + 1013904223 >>> 0;
			return state / 4294967296;
		};
	}
	//#endregion
	//#region ../shared/dist/pure/uv.js
	const FACE_NAMES = [
		"north",
		"south",
		"east",
		"west",
		"up",
		"down"
	];
	function cubeExtent(from, to) {
		return {
			w: Math.max(1, Math.ceil(Math.abs(to[0] - from[0]))),
			h: Math.max(1, Math.ceil(Math.abs(to[1] - from[1]))),
			d: Math.max(1, Math.ceil(Math.abs(to[2] - from[2])))
		};
	}
	function faceFootprint(extent, face) {
		if (face === "up" || face === "down") return [extent.w, extent.d];
		if (face === "east" || face === "west") return [extent.d, extent.h];
		return [extent.w, extent.h];
	}
	function resolveFaceSpace(uv, rotationRaw) {
		const safe = uv && uv.length >= 4 ? uv.slice(0, 4) : [
			0,
			0,
			1,
			1
		];
		const rotation = [
			0,
			90,
			180,
			270
		].includes(rotationRaw ?? 0) ? rotationRaw : 0;
		const atlasW = Math.max(1, Math.round(Math.abs(safe[2] - safe[0])));
		const atlasH = Math.max(1, Math.round(Math.abs(safe[3] - safe[1])));
		const quarterTurn = rotation === 90 || rotation === 270;
		return {
			width: quarterTurn ? atlasH : atlasW,
			height: quarterTurn ? atlasW : atlasH,
			uv: safe,
			rotation
		};
	}
	function rotateLocal(u, v, rotation) {
		if (rotation === 90) return [1 - v, u];
		if (rotation === 180) return [1 - u, 1 - v];
		if (rotation === 270) return [v, 1 - u];
		return [u, v];
	}
	function faceLocalToAtlas(space, x, y) {
		const [u, v] = rotateLocal((x + .5) / space.width, (y + .5) / space.height, space.rotation);
		return [Math.floor(space.uv[0] + (space.uv[2] - space.uv[0]) * u), Math.floor(space.uv[1] + (space.uv[3] - space.uv[1]) * v)];
	}
	function textureRef(value) {
		if (value === null || value === void 0 || value === false) return null;
		if (typeof value === "string" || typeof value === "number") return String(value);
		if (typeof value === "object") {
			const rec = value;
			if (typeof rec.uuid === "string") return rec.uuid;
			if (typeof rec.name === "string") return rec.name;
			return "assigned";
		}
		return "assigned";
	}
	function collectUvIslands(cubes, textureWidth, textureHeight) {
		const islands = [];
		for (const cube of cubes) {
			const extent = cubeExtent(cube.from, cube.to);
			for (const faceName of FACE_NAMES) {
				const face = cube.faces?.[faceName];
				if (!face?.uv || face.uv.length < 4) continue;
				const uv = face.uv.slice(0, 4);
				const bounds = [
					Math.min(uv[0], uv[2]),
					Math.min(uv[1], uv[3]),
					Math.max(uv[0], uv[2]),
					Math.max(uv[1], uv[3])
				];
				const pixelSize = [bounds[2] - bounds[0], bounds[3] - bounds[1]];
				const expected = faceFootprint(extent, faceName);
				islands.push({
					cube: cube.name,
					cube_uuid: cube.uuid,
					face: faceName,
					uv,
					bounds,
					pixel_size: pixelSize,
					expected_size: expected,
					density: [pixelSize[0] / Math.max(1, expected[0]), pixelSize[1] / Math.max(1, expected[1])],
					flip_x: uv[2] < uv[0],
					flip_y: uv[3] < uv[1],
					rotation: typeof face.rotation === "number" ? face.rotation : 0,
					texture: textureRef(face.texture),
					out_of_bounds: bounds[0] < 0 || bounds[1] < 0 || bounds[2] > textureWidth || bounds[3] > textureHeight
				});
			}
		}
		return islands;
	}
	function islandsIntersect(a, b) {
		return Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]) > 0 && Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]) > 0;
	}
	function findUvOverlaps(islands, allowed = []) {
		const allowedSet = new Set(allowed.map((pair) => [pair.a, pair.b].sort().join("|")));
		const out = [];
		for (let i = 0; i < islands.length; i += 1) for (let j = i + 1; j < islands.length; j += 1) {
			if (!islandsIntersect(islands[i], islands[j])) continue;
			const a = `${islands[i].cube}.${islands[i].face}`;
			const b = `${islands[j].cube}.${islands[j].face}`;
			out.push({
				a,
				b,
				intentional: allowedSet.has([a, b].sort().join("|"))
			});
		}
		return out;
	}
	function shelfPlace(shelf, w, h, texW, pad) {
		if (shelf.x + w + pad > texW && shelf.x > 0) {
			shelf.x = 0;
			shelf.y += shelf.rowH + pad;
			shelf.rowH = 0;
		}
		const x = shelf.x;
		const y = shelf.y;
		shelf.x += w + pad;
		shelf.rowH = Math.max(shelf.rowH, h);
		shelf.maxX = Math.max(shelf.maxX, shelf.x);
		shelf.maxY = Math.max(shelf.maxY, shelf.y + shelf.rowH);
		return [x, y];
	}
	function planUvPack(cubes, opts) {
		const pad = opts.padding ?? 1;
		const shelf = {
			x: 0,
			y: opts.startY ?? 0,
			rowH: 0,
			maxX: 0,
			maxY: opts.startY ?? 0
		};
		if (opts.mode === "box") {
			const items = cubes.map((cube) => {
				const e = cubeExtent(cube.from, cube.to);
				return {
					cube,
					fw: 2 * (e.w + e.d),
					fh: e.h + e.d
				};
			}).sort((a, b) => b.fh - a.fh || b.fw - a.fw);
			const placed = [];
			for (const it of items) {
				const [x, y] = shelfPlace(shelf, it.fw, it.fh, opts.texW, pad);
				placed.push({
					uuid: it.cube.uuid,
					name: it.cube.name,
					uv_offset: [x, y]
				});
			}
			return {
				mode: "box",
				items: placed,
				used: [shelf.maxX, shelf.maxY]
			};
		}
		const items = [];
		for (const cube of cubes) {
			const e = cubeExtent(cube.from, cube.to);
			for (const face of FACE_NAMES) {
				const [fw, fh] = faceFootprint(e, face);
				items.push({
					cube,
					face,
					fw,
					fh
				});
			}
		}
		items.sort((a, b) => b.fh - a.fh || b.fw - a.fw);
		const byCube = new Map();
		for (const it of items) {
			const [x, y] = shelfPlace(shelf, it.fw, it.fh, opts.texW, pad);
			let entry = byCube.get(it.cube.uuid);
			if (!entry) {
				entry = {
					uuid: it.cube.uuid,
					name: it.cube.name,
					faces: []
				};
				byCube.set(it.cube.uuid, entry);
			}
			const uv = [
				x,
				y,
				x + it.fw,
				y + it.fh
			];
			entry.faces.push({
				face: it.face,
				uv
			});
		}
		return {
			mode: "face",
			items: [...byCube.values()],
			used: [shelf.maxX, shelf.maxY]
		};
	}
	function nextPowerOfTwo(value) {
		let result = 1;
		while (result < value) result *= 2;
		return result;
	}
	function resolveUvModeFromHints(hints) {
		if (hints.explicit === "box" || hints.explicit === "face") return hints.explicit;
		if (hints.formatId === "java_block") return "face";
		if (hints.formatId === "geckolib_model") return "box";
		if (typeof hints.projectBoxUv === "boolean") return hints.projectBoxUv ? "box" : "face";
		if (typeof hints.formatBoxUv === "boolean") return hints.formatBoxUv ? "box" : "face";
		const flags = hints.cubeBoxFlags ?? [];
		if (flags.length) return flags.filter(Boolean).length * 2 >= flags.length ? "box" : "face";
		return "box";
	}
	//#endregion
	//#region ../shared/dist/pure/generate.js
	const CUBE_LIMIT = 4e3;
	function cap(cubes, max = CUBE_LIMIT) {
		return cubes.length > max ? cubes.slice(0, max) : cubes;
	}
	const EMPTY_CHARS = new Set([
		" ",
		".",
		"_"
	]);
	function voxelizeMatrix(params) {
		const matrix = params.matrix ?? [];
		if (!matrix.length) throw new Error("matrix must have at least one row");
		const ps = params.pixel_size ?? 1;
		const plane = params.plane ?? "xy";
		const origin = params.origin ?? [
			0,
			0,
			0
		];
		const rows = matrix.length;
		const cols = Math.max(...matrix.map((row) => [...row].length));
		const merge = params.merge_adjacent === true;
		const cubes = [];
		const notes = [];
		const depthAxis = plane === "xy" ? 2 : plane === "xz" ? 1 : 0;
		const defaultDepth = plane === "xy" ? (params.palette ?? {})[Object.keys(params.palette ?? {})[0]]?.depth ?? 1 : 1;
		const cellOrigin = (col, row, depth) => {
			if (plane === "xy") return [
				origin[0] + col * ps,
				origin[1] + (rows - 1 - row) * ps,
				origin[2] + depth
			];
			if (plane === "xz") return [
				origin[0] + col * ps,
				origin[1] + depth,
				origin[2] + row * ps
			];
			return [
				origin[0] + depth,
				origin[1] + (rows - 1 - row) * ps,
				origin[2] + col * ps
			];
		};
		const pushCell = (symbol, col, row, span) => {
			const config = params.palette?.[symbol];
			const depth = config?.depth ?? defaultDepth;
			const offset = config?.offset_z ?? 0;
			const start = cellOrigin(col, row, offset);
			const size = [
				0,
				0,
				0
			];
			if (plane === "xy") {
				size[0] = span * ps;
				size[1] = ps;
				size[2] = depth;
			} else if (plane === "xz") {
				size[0] = span * ps;
				size[1] = depth;
				size[2] = ps;
			} else {
				size[0] = depth;
				size[1] = ps;
				size[2] = span * ps;
			}
			const to = [
				start[0] + size[0],
				start[1] + size[1],
				start[2] + size[2]
			];
			const baseName = config?.name ?? `vox_${symbol.trim() || "x"}`;
			cubes.push({
				name: `${baseName}_${row}_${col}`,
				from: start,
				to,
				inflate: config?.inflate ?? 0,
				parent: params.parent
			});
		};
		for (let row = 0; row < rows; row += 1) {
			const chars = [...matrix[row]];
			let col = 0;
			while (col < cols) {
				const symbol = chars[col] ?? " ";
				if (EMPTY_CHARS.has(symbol)) {
					col += 1;
					continue;
				}
				if (!merge) {
					pushCell(symbol, col, row, 1);
					col += 1;
					continue;
				}
				let span = 1;
				while (col + span < cols && (chars[col + span] ?? " ") === symbol && !EMPTY_CHARS.has(chars[col + span] ?? " ")) span += 1;
				pushCell(symbol, col, row, span);
				col += span;
			}
		}
		if (params.z_fight_guard !== false) {
			const byName = new Map();
			for (const cube of cubes) {
				const key = `${cube.from[depthAxis]}|${cube.to[depthAxis]}`;
				byName.set(key, (byName.get(key) ?? 0) + 1);
			}
			if ([...byName.values()].some((n) => n > 1)) notes.push("coplanar depth detected; keep merge_adjacent:true or offset_z per palette entry to avoid z-fighting");
		}
		return {
			groups: [],
			cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
			notes
		};
	}
	const WORLD_ALIASES = {
		north: "north",
		front: "north",
		south: "south",
		back: "south",
		east: "east",
		right: "east",
		west: "west",
		left: "west",
		up: "up",
		top: "up",
		down: "down",
		bottom: "down"
	};
	function hollowVolume(params) {
		const lo = [
			Math.min(params.from[0], params.to[0]),
			Math.min(params.from[1], params.to[1]),
			Math.min(params.from[2], params.to[2])
		];
		const hi = [
			Math.max(params.from[0], params.to[0]),
			Math.max(params.from[1], params.to[1]),
			Math.max(params.from[2], params.to[2])
		];
		const size = [
			hi[0] - lo[0],
			hi[1] - lo[1],
			hi[2] - lo[2]
		];
		if (size.some((v) => v <= 0)) throw new Error("bounds must have positive size");
		const requested = params.wall_thickness ?? 1;
		const t = Math.min(requested, ...[
			0,
			1,
			2
		].map((i) => Math.max(.001, size[i] / 2 - .001)));
		const open = new Set((params.open_faces ?? []).map((f) => WORLD_ALIASES[f.toLowerCase()]).filter(Boolean));
		const name = params.name ?? "shell";
		const inflate = params.inflate ?? 0;
		const axes = [
			["north", () => [[
				lo[0],
				lo[1],
				lo[2]
			], [
				hi[0],
				hi[1],
				lo[2] + t
			]]],
			["south", () => [[
				lo[0],
				lo[1],
				hi[2] - t
			], [
				hi[0],
				hi[1],
				hi[2]
			]]],
			["west", () => [[
				lo[0],
				lo[1],
				lo[2] + t
			], [
				lo[0] + t,
				hi[1],
				hi[2] - t
			]]],
			["east", () => [[
				hi[0] - t,
				lo[1],
				lo[2] + t
			], [
				hi[0],
				hi[1],
				hi[2] - t
			]]],
			["down", () => [[
				lo[0] + t,
				lo[1],
				lo[2] + t
			], [
				hi[0] - t,
				lo[1] + t,
				hi[2] - t
			]]],
			["up", () => [[
				lo[0] + t,
				hi[1] - t,
				lo[2] + t
			], [
				hi[0] - t,
				hi[1],
				hi[2] - t
			]]]
		];
		const cubes = [];
		for (const [face, make] of axes) {
			if (open.has(face)) continue;
			const [from, to] = make(face);
			if (to.some((v, i) => v - from[i] <= 0)) continue;
			cubes.push({
				name: `${name}_${face}`,
				from,
				to,
				inflate,
				parent: params.parent
			});
		}
		const cavity = [[
			lo[0] + t,
			lo[1] + t,
			lo[2] + t
		], [
			hi[0] - t,
			hi[1] - t,
			hi[2] - t
		]];
		return {
			groups: [],
			cubes,
			notes: [`wall_thickness used: ${Number(t.toFixed(3))}`, "keep >=0.1 clearance from walls for anything placed inside the cavity"],
			points: {
				cavity_min: cavity[0],
				cavity_max: cavity[1]
			}
		};
	}
	function generateArray(params) {
		const mode = params.mode ?? "linear";
		const random = makeRandom(params.seed ?? 1374496523);
		const prefix = params.name_prefix ?? "element";
		const rotation = params.rotation ?? [
			0,
			0,
			0
		];
		const jitter = params.jitter ?? [
			0,
			0,
			0
		];
		const decay = params.size_decay ?? [
			0,
			0,
			0
		];
		const baseSize = params.element_size;
		if (baseSize.some((v) => v <= 0)) throw new Error("element_size must be positive");
		const cubes = [];
		const notes = [];
		const anchorOffset = (size, point) => {
			const anchor = params.anchor ?? "center";
			const centeredX = point[0] - size[0] / 2;
			const centeredZ = point[2] - size[2] / 2;
			if (anchor === "top") return [
				centeredX,
				point[1] - size[1],
				centeredZ
			];
			if (anchor === "bottom") return [
				centeredX,
				point[1],
				centeredZ
			];
			if (anchor === "min") return [
				point[0],
				point[1],
				point[2]
			];
			return [
				centeredX,
				point[1] - size[1] / 2,
				centeredZ
			];
		};
		const jittered = (point) => point.map((v, i) => v + (random() * 2 - 1) * jitter[i]);
		const spin = () => params.rotation_range ? [
			0,
			1,
			2
		].map((i) => rotation[i] + params.rotation_range.min[i] + random() * (params.rotation_range.max[i] - params.rotation_range.min[i])) : [...rotation];
		const staggerStep = params.depth_stagger ?? 0;
		const requested = params.depth_axis ?? "auto";
		let autoAxis = 2;
		const staggerAxis = () => {
			if (requested === "none") return -1;
			if (requested === "x") return 0;
			if (requested === "y") return 1;
			if (requested === "z") return 2;
			if (requested === "radial") return -1;
			return autoAxis;
		};
		const pushAt = (point, index, stagger) => {
			const size = [
				Math.max(.05, baseSize[0] + decay[0] * index),
				Math.max(.05, baseSize[1] + decay[1] * index),
				Math.max(.05, baseSize[2] + decay[2] * index)
			];
			const from = anchorOffset(size, jittered(point));
			const to = [
				from[0] + size[0],
				from[1] + size[1],
				from[2] + size[2]
			];
			if (stagger !== 0) {
				const axis = staggerAxis();
				if (axis >= 0) {
					from[axis] += stagger;
					to[axis] += stagger;
				}
			}
			cubes.push({
				name: `${prefix}_${index + 1}`,
				from,
				to,
				rotation: spin(),
				inflate: params.inflate ?? 0,
				parent: params.parent
			});
		};
		if (mode === "linear") {
			const start = params.start ?? [
				0,
				0,
				0
			];
			const end = params.end ?? [
				start[0] + 8,
				start[1],
				start[2]
			];
			const count = Math.max(1, params.count ?? 2);
			const distribution = params.distribution ?? "span";
			const delta = [
				end[0] - start[0],
				end[1] - start[1],
				end[2] - start[2]
			];
			autoAxis = [
				0,
				1,
				2
			].reduce((best, axis) => Math.abs(delta[axis]) > Math.abs(delta[best]) ? axis : best, 0) === 2 ? 0 : 2;
			for (let i = 0; i < count; i += 1) {
				const f = distribution === "cells" ? count === 1 ? .5 : (i + .5) / count : count === 1 ? 0 : i / (count - 1);
				pushAt([
					start[0] + delta[0] * f,
					start[1] + delta[1] * f,
					start[2] + delta[2] * f
				], i, i % 2 === 0 ? staggerStep : -staggerStep);
			}
		} else if (mode === "radial") {
			const center = params.center ?? [
				0,
				0,
				0
			];
			const [rx, rz] = params.radii ?? [8, 8];
			const count = Math.max(1, params.count ?? 8);
			const arc = params.arc_degrees ?? 360;
			const startDeg = params.start_degrees ?? 0;
			const align = params.align_to_center !== false;
			for (let i = 0; i < count; i += 1) {
				const rad = (startDeg + arc * (count === 1 ? 0 : i / count)) * Math.PI / 180;
				const point = [
					center[0] + Math.cos(rad) * rx,
					center[1],
					center[2] + Math.sin(rad) * rz
				];
				const index = cubes.length;
				pushAt(point, index, i % 2 === 0 ? staggerStep : -staggerStep);
				if (align) {
					const outward = [
						rotation[0],
						rotation[1] + Math.atan2(Math.cos(rad), Math.sin(rad)) * 180 / Math.PI,
						rotation[2]
					];
					cubes[cubes.length - 1].rotation = outward;
				}
				if (staggerStep !== 0 && (params.depth_axis ?? "auto") === "radial") {
					const outwardDir = [
						Math.cos(rad),
						0,
						Math.sin(rad)
					];
					const sign = i % 2 === 0 ? 1 : -1;
					const cube = cubes[cubes.length - 1];
					for (let a = 0; a < 3; a += 1) {
						cube.from[a] += outwardDir[a] * staggerStep * sign;
						cube.to[a] += outwardDir[a] * staggerStep * sign;
					}
				}
			}
		} else {
			const start = params.start ?? [
				0,
				0,
				0
			];
			const end = params.end ?? [
				8,
				0,
				8
			];
			const span = [
				end[0] - start[0],
				end[1] - start[1],
				end[2] - start[2]
			];
			let counts = params.counts;
			if (!counts) {
				const total = Math.max(1, params.count ?? 8);
				const per = Math.max(1, Math.round(Math.cbrt(total)));
				counts = [
					per,
					per,
					per
				];
			}
			let index = 0;
			for (let iz = 0; iz < counts[2]; iz += 1) for (let iy = 0; iy < counts[1]; iy += 1) for (let ix = 0; ix < counts[0]; ix += 1) {
				if (params.count !== void 0 && index >= params.count) break;
				const f = [
					counts[0] === 1 ? .5 : ix / (counts[0] - 1),
					counts[1] === 1 ? .5 : iy / (counts[1] - 1),
					counts[2] === 1 ? .5 : iz / (counts[2] - 1)
				];
				pushAt([
					start[0] + span[0] * f[0],
					start[1] + span[1] * f[1],
					start[2] + span[2] * f[2]
				], index, (index % 2 === 0 ? 1 : -1) * staggerStep);
				index += 1;
			}
		}
		if (staggerStep === 0 && cubes.length <= 400) {
			let risky = 0;
			for (let i = 0; i < cubes.length; i += 1) for (let j = i + 1; j < cubes.length; j += 1) {
				const a = cubes[i];
				const b = cubes[j];
				let overlapping = 0;
				let coplanar = 0;
				for (let k = 0; k < 3; k += 1) {
					const lo = Math.max(a.from[k], b.from[k]);
					if (Math.min(a.to[k], b.to[k]) - lo > 1e-6) overlapping += 1;
					else if (Math.abs(a.from[k] - b.from[k]) < 1e-6 || Math.abs(a.to[k] - b.to[k]) < 1e-6 || Math.abs(a.from[k] - b.to[k]) < 1e-6 || Math.abs(a.to[k] - b.from[k]) < 1e-6) coplanar += 1;
				}
				if (overlapping === 3 || overlapping === 2 && coplanar >= 1) risky += 1;
			}
			if (risky) notes.push(`${risky} overlapping/coplanar element pair(s); pass depth_stagger 0.05-0.2 (or larger spacing) to avoid z-fighting`);
		}
		return {
			groups: [],
			cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
			notes
		};
	}
	const DIRECTIONS = {
		up: [
			0,
			1,
			0
		],
		down: [
			0,
			-1,
			0
		],
		forward: [
			0,
			0,
			-1
		],
		back: [
			0,
			0,
			1
		],
		left: [
			-1,
			0,
			0
		],
		right: [
			1,
			0,
			0
		]
	};
	function extrudeChain(params) {
		const segments = Math.max(1, Math.min(64, params.segments ?? 4));
		const len = params.segment_length ?? 4;
		const [w0, d0] = params.initial_size ?? [4, 4];
		const taper = Math.min(.95, Math.max(0, params.taper ?? .35));
		const lengthTaper = Math.min(.95, Math.max(0, params.length_taper ?? 0));
		const curvature = params.curvature ?? [
			0,
			0,
			0
		];
		const baseRot = params.base_rotation ?? [
			0,
			0,
			0
		];
		const dir = DIRECTIONS[params.direction ?? "up"] ?? DIRECTIONS.up;
		const name = params.name ?? "chain";
		const step = 1 - taper;
		const lenStep = 1 - lengthTaper;
		const sizeScale = Math.pow(step, 1 / 3);
		const groups = [];
		const cubes = [];
		let cursor = [...params.base_origin];
		let size = [w0, d0];
		let segmentLen = len;
		for (let i = 0; i < segments; i += 1) {
			const rot = [
				baseRot[0] + curvature[0] * i,
				baseRot[1] + curvature[1] * i,
				baseRot[2] + curvature[2] * i
			];
			const boneName = `${name}${i + 1}`;
			if (params.create_bones !== false) groups.push({
				name: boneName,
				origin: [...cursor],
				rotation: rot,
				parent: i === 0 ? params.parent : `${name}${i}`
			});
			const half = [
				size[0] / 2,
				size[1] / 2,
				size[0] / 2
			];
			const from = [
				cursor[0] - half[0],
				cursor[1],
				cursor[2] - half[2]
			];
			const to = [
				from[0] + size[0],
				from[1] + segmentLen,
				from[2] + size[1]
			];
			if (dir[1] !== 0) {} else if (dir[2] !== 0) {
				to[1] = from[1] + size[1];
				to[2] = from[2] + segmentLen * dir[2];
				to[0] = from[0] + size[0];
			} else {
				to[0] = from[0] + segmentLen * dir[0];
				to[1] = from[1] + size[1];
				to[2] = from[2] + size[1];
			}
			cubes.push({
				name: `${name}${i + 1}_seg`,
				from,
				to,
				origin: [...cursor],
				parent: params.create_bones !== false ? boneName : params.parent,
				inflate: params.inflate ?? 0
			});
			const stepVec = [
				dir[0] * segmentLen,
				dir[1] * segmentLen,
				dir[2] * segmentLen
			];
			cursor = [
				cursor[0] + stepVec[0],
				cursor[1] + stepVec[1],
				cursor[2] + stepVec[2]
			];
			segmentLen *= lenStep;
			size = [Math.max(.1, size[0] * sizeScale), Math.max(.1, size[1] * sizeScale)];
		}
		return {
			groups,
			cubes,
			notes: params.create_bones === false ? ["create_bones:false — rotations baked into cubes, chain cannot be animated"] : [],
			points: { tip: cursor }
		};
	}
	function addWing(params) {
		const side = params.side;
		const sign = side === "right" ? 1 : -1;
		const plane = params.plane ?? "horizontal";
		const fingers = Math.max(1, Math.min(6, params.fingers ?? 3));
		const armLen = params.arm_length ?? 8;
		const foreLen = params.forearm_length ?? 10;
		const thickness = params.bone_thickness ?? 2;
		const membrane = params.membrane ?? "cubes";
		const attachToBody = params.attach_to_body !== false;
		const membraneThickness = params.membrane_thickness ?? .5;
		const bones = `${params.name ?? "wing"}_${side}`;
		const base = [...params.base_origin];
		const armAngle = params.arm_angle ?? (plane === "horizontal" ? 20 : 35);
		const foreAngle = params.forearm_angle ?? (plane === "horizontal" ? -15 : 70);
		const spread = params.finger_spread ?? (plane === "horizontal" ? [0, 80] : [100, 10]);
		const fingerAngles = params.finger_angles ?? Array.from({ length: fingers }, (_, i) => fingers === 1 ? spread[0] : spread[0] + (spread[1] - spread[0]) * i / (fingers - 1));
		const lengths = typeof params.finger_length === "number" ? Array.from({ length: fingers }, (_, i) => params.finger_length * Math.pow(.7, i)) : params.finger_length ?? Array.from({ length: fingers }, (_, i) => 16 * Math.pow(.7, i));
		const groups = [];
		const cubes = [];
		const notes = [];
		const toWorld = (angleDeg, dist, from) => {
			const rad = angleDeg * Math.PI / 180;
			if (plane === "horizontal") return [
				from[0] + Math.cos(rad) * dist * sign,
				from[1],
				from[2] - Math.sin(rad) * dist
			];
			return [
				from[0] + Math.sin(rad) * dist * sign,
				from[1] + Math.cos(rad) * dist,
				from[2]
			];
		};
		const armOrigin = base;
		groups.push({
			name: `${bones}_arm`,
			origin: armOrigin,
			rotation: [
				0,
				0,
				0
			],
			parent: params.parent
		});
		const elbow = toWorld(armAngle, armLen, armOrigin);
		groups.push({
			name: `${bones}_forearm`,
			origin: elbow,
			rotation: [
				0,
				0,
				0
			],
			parent: `${bones}_arm`
		});
		const wrist = toWorld(foreAngle, foreLen, elbow);
		const boneFrom = (a, b, nm) => {
			const half = thickness / 2;
			return {
				name: nm,
				from: [
					Math.min(a[0], b[0]) - half,
					Math.min(a[1], b[1]) - half,
					Math.min(a[2], b[2]) - half
				],
				to: [
					Math.max(a[0], b[0]) + half,
					Math.max(a[1], b[1]) + half,
					Math.max(a[2], b[2]) + half
				],
				parent: nm.includes("forearm") ? `${bones}_forearm` : `${bones}_arm`,
				inflate: 0
			};
		};
		cubes.push(boneFrom(armOrigin, elbow, `${bones}_arm_bone`));
		cubes.push(boneFrom(elbow, wrist, `${bones}_forearm_bone`));
		const tips = [];
		fingerAngles.forEach((angle, index) => {
			const boneName = `${bones}_finger${index + 1}`;
			groups.push({
				name: boneName,
				origin: wrist,
				rotation: [
					0,
					0,
					0
				],
				parent: `${bones}_forearm`
			});
			const tip = toWorld(angle, lengths[index], wrist);
			tips.push(tip);
			cubes.push({
				name: `${boneName}_bone`,
				from: [
					Math.min(wrist[0], tip[0]) - thickness / 4,
					Math.min(wrist[1], tip[1]) - thickness / 4,
					Math.min(wrist[2], tip[2]) - thickness / 4
				],
				to: [
					Math.max(wrist[0], tip[0]) + thickness / 4,
					Math.max(wrist[1], tip[1]) + thickness / 4,
					Math.max(wrist[2], tip[2]) + thickness / 4
				],
				parent: boneName
			});
		});
		if (membrane !== "none") {
			const panels = [];
			for (let i = 0; i < tips.length - 1; i += 1) panels.push([
				tips[i],
				tips[i + 1],
				`${bones}_membrane${i + 1}`
			]);
			if (attachToBody) {
				const attach = params.membrane_attach ?? (plane === "horizontal" ? [
					base[0],
					base[1],
					base[2] + armLen + foreLen
				] : [
					base[0],
					base[1] - (armLen + foreLen) * .9,
					base[2]
				]);
				panels.push([
					tips[tips.length - 1],
					attach,
					`${bones}_membrane_body`
				]);
			}
			panels.forEach(([a, b, nm], index) => {
				const stagger = index % 2 === 0 ? 0 : membraneThickness * .2;
				cubes.push({
					name: nm,
					from: [
						Math.min(a[0], b[0]),
						Math.min(a[1], b[1]),
						Math.min(a[2], b[2]) + stagger
					],
					to: [
						Math.max(a[0], b[0]),
						Math.max(a[1], b[1]) + .01,
						Math.max(a[2], b[2]) + membraneThickness + stagger
					],
					parent: `${bones}_forearm`,
					inflate: 0
				});
			});
			notes.push("membrane panels staggered so neighbours do not z-fight");
		}
		return {
			groups,
			cubes: cap(cubes, params.max_cubes ?? CUBE_LIMIT),
			notes,
			points: {
				shoulder: base,
				elbow,
				wrist,
				finger_tips: tips[0],
				membrane_attach: params.membrane_attach ?? base
			}
		};
	}
	//#endregion
	//#region ../shared/dist/pure/audit.js
	function parentChain(element, byUuid) {
		const out = [];
		let parent = element.parent ? byUuid.get(element.parent) : void 0;
		let guard = 0;
		while (parent && guard < 64) {
			out.push(parent);
			parent = parent.parent ? byUuid.get(parent.parent) : void 0;
			guard += 1;
		}
		return out;
	}
	function worldBounds(element, byUuid) {
		if (!element.from || !element.to) {
			const p = element.origin;
			return {
				min: [...p],
				max: [...p]
			};
		}
		return boundsOfPoints(boxCorners(element.from, element.to, element.inflate ?? 0).map((point) => {
			let next = rotatePoint(point, element.origin, element.rotation);
			for (const group of parentChain(element, byUuid)) next = rotatePoint(next, group.origin, group.rotation);
			return next;
		}));
	}
	function measureModel(elements, refs) {
		const byUuid = new Map(elements.map((e) => [e.uuid, e]));
		const byName = new Map(elements.map((e) => [e.name, e]));
		const selected = refs?.length ? refs.map((ref) => byUuid.get(ref) ?? byName.get(ref)).filter(Boolean) : elements.filter((e) => e.type === "cube");
		const descendants = (root) => {
			if (root.type === "cube") return [root];
			const out = [];
			const visit = (node) => {
				for (const child of elements) if (child.parent === node.uuid) {
					if (child.type === "cube") out.push(child);
					else visit(child);
				}
			};
			visit(root);
			return out;
		};
		const rows = selected.map((element) => {
			const cubes = descendants(element);
			const boxes = cubes.map((cube) => worldBounds(cube, byUuid));
			const min = boxes.length ? [
				0,
				1,
				2
			].map((i) => Math.min(...boxes.map((b) => b.min[i]))) : element.origin;
			const max = boxes.length ? [
				0,
				1,
				2
			].map((i) => Math.max(...boxes.map((b) => b.max[i]))) : element.origin;
			return {
				ref: element.uuid,
				name: element.name,
				type: element.type,
				cubes: cubes.length,
				min,
				max,
				size: min.map((v, i) => max[i] - v),
				center: min.map((v, i) => (v + max[i]) / 2),
				volume: cubes.reduce((sum, cube) => sum + geometricVolume(cube.from, cube.to, cube.inflate ?? 0), 0)
			};
		});
		const boxes = rows.filter((row) => row.cubes > 0);
		const min = [
			0,
			1,
			2
		].map((i) => boxes.length ? Math.min(...boxes.map((row) => row.min[i])) : 0);
		const max = [
			0,
			1,
			2
		].map((i) => boxes.length ? Math.max(...boxes.map((row) => row.max[i])) : 0);
		const unique = new Set(selected.flatMap((el) => descendants(el).map((c) => c.uuid)));
		return {
			bounds: {
				min,
				max,
				size: min.map((v, i) => max[i] - v),
				center: min.map((v, i) => (v + max[i]) / 2)
			},
			cubes: unique.size,
			total_volume: elements.filter((e) => unique.has(e.uuid)).reduce((sum, cube) => sum + geometricVolume(cube.from, cube.to, cube.inflate ?? 0), 0),
			elements: rows
		};
	}
	function checkModel(elements, opts) {
		const findings = [];
		const byUuid = new Map(elements.map((e) => [e.uuid, e]));
		const cubes = elements.filter((e) => e.type === "cube");
		const groups = elements.filter((e) => e.type === "group");
		for (const group of groups) if (!elements.some((e) => e.parent === group.uuid)) findings.push({
			severity: "error",
			code: "EMPTY_GROUP",
			element: group.name,
			message: `Group "${group.name}" has no children — delete it or add geometry.`
		});
		if (!cubes.length) findings.push({
			severity: "error",
			code: "NO_CUBES",
			message: "Project has no cubes."
		});
		const boxes = cubes.map((cube) => ({
			cube,
			box: worldBounds(cube, byUuid)
		}));
		for (const { cube, box } of boxes) {
			if (geometricVolume(cube.from, cube.to, cube.inflate ?? 0) <= 0) findings.push({
				severity: "error",
				code: "ZERO_VOLUME",
				element: cube.name,
				message: `Cube "${cube.name}" has zero volume.`
			});
			if (boundsSize(box).some((s) => s > 0 && s < 1)) findings.push({
				severity: "warn",
				code: "SLIVER",
				element: cube.name,
				message: `Cube "${cube.name}" has a sub-1 unit thickness — often reads as noise.`
			});
			if (cube.untexturedFaces?.length) findings.push({
				severity: "warn",
				code: "UNTEXTURED_FACE",
				element: cube.name,
				message: `Cube "${cube.name}" has ${cube.untexturedFaces.length} untextured face(s): ${cube.untexturedFaces.join(", ")}.`
			});
			if (cube.faceUvOutOfBounds) findings.push({
				severity: "error",
				code: "UV_OUT_OF_BOUNDS",
				element: cube.name,
				message: `Cube "${cube.name}" has ${cube.faceUvOutOfBounds} face UV(s) outside ${opts.textureWidth}×${opts.textureHeight}.`
			});
			if (cube.parent) {
				const parent = byUuid.get(cube.parent);
				if (parent && parent.type === "group") {
					const d = dist(boundsCenter(box), parent.origin);
					const diag = dist(box.min, box.max);
					if (diag > 0 && d > diag * 2.5) findings.push({
						severity: "warn",
						code: "BAD_PIVOT",
						element: cube.name,
						message: `Cube "${cube.name}" is far from its parent pivot — animation will look wrong.`
					});
				}
			}
		}
		for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
			const a = boxes[i];
			const b = boxes[j];
			if (!boundsIntersect(a.box, b.box)) continue;
			const inter = boundsIntersectionVolume(a.box, b.box);
			const smaller = Math.min(boundsVolume(a.box), boundsVolume(b.box));
			const ratio = smaller > 0 ? inter / smaller : 0;
			if (ratio > .97) findings.push({
				severity: "error",
				code: "COPLANAR_OVERLAP",
				element: `${a.cube.name}|${b.cube.name}`,
				message: `Cubes "${a.cube.name}" and "${b.cube.name}" occupy the same volume — nudge one by >=0.1 to stop z-fighting.`
			});
			else if (ratio > .35) findings.push({
				severity: "info",
				code: "OVERLAP",
				element: `${a.cube.name}|${b.cube.name}`,
				message: `Cubes "${a.cube.name}" and "${b.cube.name}" overlap significantly.`
			});
		}
		if (opts.uvIslands) {
			const allowed = new Set((opts.allowOverlaps ?? []).map((p) => [p.a, p.b].sort().join("|")));
			const bad = opts.uvIslands.filter((island) => island.out_of_bounds).length;
			if (bad) findings.push({
				severity: "error",
				code: "UV_ISLAND_OUT_OF_BOUNDS",
				message: `${bad} UV island(s) lie outside the atlas.`
			});
			const seen = new Set();
			let unintended = 0;
			for (let i = 0; i < opts.uvIslands.length; i += 1) for (let j = i + 1; j < opts.uvIslands.length; j += 1) {
				const a = opts.uvIslands[i];
				const b = opts.uvIslands[j];
				if (Math.min(a.bounds[2], b.bounds[2]) - Math.max(a.bounds[0], b.bounds[0]) <= 0 || Math.min(a.bounds[3], b.bounds[3]) - Math.max(a.bounds[1], b.bounds[1]) <= 0) continue;
				const key = [`${a.cube}.${a.face}`, `${b.cube}.${b.face}`].sort().join("|");
				if (seen.has(key)) continue;
				seen.add(key);
				if (!allowed.has(key)) unintended += 1;
			}
			if (unintended) findings.push({
				severity: "warn",
				code: "UV_OVERLAP",
				message: `${unintended} unintended overlapping UV face pair(s) — run get_uv_layout before painting.`
			});
		}
		const errors = findings.filter((f) => f.severity === "error").length;
		const warns = findings.filter((f) => f.severity === "warn").length;
		return {
			findings,
			summary: {
				cubes: cubes.length,
				groups: groups.length,
				errors,
				warns
			}
		};
	}
	const BUDGETS = {
		prop: [30, 80],
		character: [80, 180],
		creature: [80, 180],
		hero: [120, 300]
	};
	function auditComplexity(elements, opts = {}) {
		const cubes = elements.filter((e) => e.type === "cube");
		const byUuid = new Map(elements.map((e) => [e.uuid, e]));
		const hasRig = elements.some((e) => e.type === "group");
		const target = opts.target && opts.target !== "auto" ? opts.target : hasRig ? "character" : "prop";
		const [minimum, detailed] = BUDGETS[target];
		const minRequired = opts.min_cubes ?? minimum;
		const monolithShare = opts.monolith_share ?? .3;
		const minOverlays = opts.min_overlays ?? 4;
		opts.flat_face_area;
		const boxes = cubes.map((cube) => ({
			cube,
			box: worldBounds(cube, byUuid)
		}));
		const totalVolume = boxes.reduce((sum, b) => sum + boundsVolume(b.box), 0);
		const issues = [];
		let monolithic = 0;
		for (const { cube, box } of boxes) {
			const share = totalVolume > 0 ? boundsVolume(box) / totalVolume : 0;
			if (share <= monolithShare) continue;
			const overlays = boxes.filter((other) => other.cube.uuid !== cube.uuid && boundsIntersect(other.box, box) && boundsVolume(other.box) < boundsVolume(box) * .5).length;
			if (overlays < minOverlays) {
				monolithic += 1;
				issues.push(`"${cube.name}" holds ${(share * 100).toFixed(0)}% of the volume with ${overlays} layered detail piece(s) — split it or layer geometry on it.`);
			}
		}
		const overlapping = boxes.filter((a) => boxes.some((b) => b !== a && boundsIntersect(a.box, b.box))).length;
		const micro = cubes.filter((cube) => {
			return boundsSize(worldBounds(cube, byUuid)).every((s) => s <= 2);
		}).length;
		const rotated = cubes.filter((cube) => cube.rotation.some((v) => Math.abs(v) > 1e-6)).length;
		const depth = (() => {
			let max = 0;
			for (const group of elements.filter((e) => e.type === "group")) {
				let d = 1;
				let parent = group.parent ? byUuid.get(group.parent) : void 0;
				while (parent && d < 64) {
					d += 1;
					parent = parent.parent ? byUuid.get(parent.parent) : void 0;
				}
				max = Math.max(max, d);
			}
			return max;
		})();
		const bareSlabs = boxes.filter(({ cube }) => {
			const size = boundsSize(worldBounds(cube, byUuid));
			return Math.max(...size) >= 8 && !boxes.some((other) => other.cube.uuid !== cube.uuid && boundsIntersect(other.box, worldBounds(cube, byUuid)));
		}).length;
		if (bareSlabs) issues.push(`${bareSlabs} large cube(s) have nothing layered on them (bare slabs).`);
		if (monolithic) issues.push(`${monolithic} monolithic box(es) — the classic "one cube per torso" tell.`);
		const cubeCount = cubes.length;
		const verdict = cubeCount < minRequired ? "too_primitive" : cubeCount >= detailed ? "high_detail" : "acceptable";
		if (verdict === "too_primitive") issues.push(`Only ${cubeCount} cube(s); the ${target} budget starts at ${minRequired}. Use add_hollow_volume / generate_array / extrude_chain / voxelize_matrix to add real detail.`);
		return {
			verdict,
			ready_for_texturing: verdict !== "too_primitive" && !monolithic,
			cubes: cubeCount,
			metrics: {
				target,
				budget: [minimum, detailed],
				monolithic_boxes: monolithic,
				micro_pct: Math.round(micro / Math.max(1, cubeCount) * 100),
				overlapping_pct: Math.round(overlapping / Math.max(1, cubeCount) * 100),
				rotated_pct: Math.round(rotated / Math.max(1, cubeCount) * 100),
				bone_depth: depth,
				bare_slabs: bareSlabs
			},
			issues
		};
	}
	function auditSymmetry(pairs, opts = {}) {
		const axis = opts.axis ?? "x";
		const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
		const pivot = opts.pivot ?? 0;
		const tolerance = opts.tolerance ?? .001;
		const rows = pairs.map((pair) => {
			const expectMin = [...pair.left.min];
			const expectMax = [...pair.left.max];
			const expectOrigin = [...pair.left.origin];
			expectMin[ai] = pivot * 2 - pair.left.max[ai];
			expectMax[ai] = pivot * 2 - pair.left.min[ai];
			expectOrigin[ai] = pivot * 2 - pair.left.origin[ai];
			const errors = [];
			for (let i = 0; i < 3; i += 1) errors.push(Math.abs(expectMin[i] - pair.right.min[i]), Math.abs(expectMax[i] - pair.right.max[i]), Math.abs(expectOrigin[i] - pair.right.origin[i]));
			const maxError = Math.max(...errors);
			return {
				left: pair.left.name,
				right: pair.right.name,
				max_error: Number(maxError.toFixed(6)),
				passed: maxError <= tolerance,
				expected: {
					min: expectMin,
					max: expectMax,
					origin: expectOrigin
				},
				actual: {
					min: pair.right.min,
					max: pair.right.max,
					origin: pair.right.origin
				}
			};
		});
		return {
			axis,
			pivot,
			pairs: rows,
			summary: {
				passed: rows.filter((row) => row.passed).length,
				failed: rows.filter((row) => !row.passed).length
			}
		};
	}
	const SIDE_TOKENS = new Set([
		"left",
		"right",
		"l",
		"r"
	]);
	function nameSide(name) {
		const tokens = name.toLowerCase().split(/[_\-. ]+/);
		if (tokens.includes("left") || tokens.includes("l")) return "left";
		if (tokens.includes("right") || tokens.includes("r")) return "right";
		if (/right/i.test(name)) return "right";
		if (/left/i.test(name)) return "left";
		return null;
	}
	function baseName(name) {
		return name.toLowerCase().split(/[_\-. ]+/).filter((token) => !SIDE_TOKENS.has(token)).join("");
	}
	function checkSides(elements) {
		const findings = [];
		const byUuid = new Map(elements.map((e) => [e.uuid, e]));
		const limbish = elements.filter((e) => e.type === "group" && nameSide(e.name) !== null);
		let mismatched = 0;
		let unpaired = 0;
		for (const element of limbish) {
			const declared = nameSide(element.name);
			if (!declared) continue;
			const actual = element.origin[0] > .001 ? "right" : element.origin[0] < -.001 ? "left" : null;
			if (actual && actual !== declared) {
				mismatched += 1;
				findings.push({
					severity: "error",
					code: "SIDE_MISMATCH",
					element: element.name,
					message: `"${element.name}" is named ${declared} but sits at x=${element.origin[0]} (the model's ${actual}); the model faces -Z so its own right is +X.`
				});
			}
			if (!limbish.find((other) => other.uuid !== element.uuid && nameSide(other.name) === (declared === "left" ? "right" : "left") && baseName(other.name) === baseName(element.name))) {
				unpaired += 1;
				findings.push({
					severity: "warn",
					code: "SIDE_UNPAIRED",
					element: element.name,
					message: `"${element.name}" has no mirrored counterpart — mirror_elements or create_limb mirror:"x".`
				});
			}
		}
		for (const element of elements) if (element.parent && !byUuid.has(element.parent)) findings.push({
			severity: "error",
			code: "ORPHAN_PARENT",
			element: element.name,
			message: `"${element.name}" references missing parent ${element.parent}.`
		});
		return {
			findings,
			summary: {
				checked: limbish.length,
				mismatched,
				unpaired
			}
		};
	}
	function checkRig(elements) {
		const groups = elements.filter((e) => e.type === "group");
		const findings = [];
		const byUuid = new Map(elements.map((e) => [e.uuid, e]));
		const lower = (name) => name.toLowerCase();
		const limbs = [
			"arm",
			"leg",
			"wing",
			"hand",
			"foot"
		].filter((part) => groups.some((g) => lower(g.name).includes(part)));
		for (const group of groups) {
			const segments = groups.filter((g) => {
				if (g.uuid === group.uuid) return false;
				let parent = g.parent ? byUuid.get(g.parent) : void 0;
				let guard = 0;
				while (parent && guard < 16) {
					if (parent.uuid === group.uuid) return true;
					parent = parent.parent ? byUuid.get(parent.parent) : void 0;
					guard += 1;
				}
				return false;
			}).length;
			const name = lower(group.name);
			if ([
				"arm",
				"leg",
				"wing"
			].some((p) => name.includes(p)) && segments < 2) findings.push({
				severity: "warn",
				code: "TWO_BONE_LIMB",
				element: group.name,
				message: `"${group.name}" has ${segments + 1} segment(s); use 3 bones per limb so elbows/knees can bend.`
			});
		}
		const looseCubes = elements.filter((e) => e.type === "cube" && !e.parent).length;
		if (looseCubes) findings.push({
			severity: "error",
			code: "LOOSE_CUBES",
			message: `${looseCubes} cube(s) are not parented to a bone — animated formats cannot drive them.`
		});
		const originIssues = elements.filter((element) => {
			if (element.type === "group") {
				const children = elements.filter((e) => e.parent === element.uuid);
				if (!children.length) return false;
				return !children.some((child) => {
					if (!child.from || !child.to) return true;
					const box = {
						min: child.from,
						max: child.to
					};
					return dist(boundsCenter(box), element.origin) <= dist(box.min, box.max) * 1.5 + 1;
				});
			}
			return false;
		});
		for (const element of originIssues) findings.push({
			severity: "warn",
			code: "ORIGIN_FAR_FROM_JOINT",
			element: element.name,
			message: `Bone "${element.name}" pivot is far from its geometry — put it on the real joint.`
		});
		return {
			findings,
			summary: {
				bones: groups.length,
				limbs: limbs.length,
				ready: !findings.some((f) => f.severity === "error")
			}
		};
	}
	function silhouetteFromRgba(data, width, height, alphaThreshold = 8, luminanceThreshold = 245) {
		const mask = new Uint8Array(width * height);
		for (let i = 0; i < width * height; i += 1) {
			const alpha = data[i * 4 + 3];
			const luminance = data[i * 4] * .2126 + data[i * 4 + 1] * .7152 + data[i * 4 + 2] * .0722;
			mask[i] = alpha > alphaThreshold && luminance < luminanceThreshold ? 1 : 0;
		}
		return {
			width,
			height,
			mask
		};
	}
	function silhouetteBounds(s) {
		let minX = s.width;
		let minY = s.height;
		let maxX = -1;
		let maxY = -1;
		for (let y = 0; y < s.height; y += 1) for (let x = 0; x < s.width; x += 1) {
			if (!s.mask[y * s.width + x]) continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
		return maxX < 0 ? [
			0,
			0,
			0,
			0
		] : [
			minX,
			minY,
			maxX + 1,
			maxY + 1
		];
	}
	function compareSilhouettes(model, reference, gridSize = 64) {
		const normalize = (s) => {
			const [minX, minY, maxX, maxY] = silhouetteBounds(s);
			const w = Math.max(1, maxX - minX);
			const h = Math.max(1, maxY - minY);
			const out = new Uint8Array(gridSize * gridSize);
			for (let gy = 0; gy < gridSize; gy += 1) for (let gx = 0; gx < gridSize; gx += 1) {
				const sx = Math.min(s.width - 1, minX + Math.floor(gx / gridSize * w));
				const sy = Math.min(s.height - 1, minY + Math.floor(gy / gridSize * h));
				out[gy * gridSize + gx] = s.mask[sy * s.width + sx] ?? 0;
			}
			return out;
		};
		const a = normalize(model);
		const b = normalize(reference);
		let inter = 0;
		let union = 0;
		let refOnly = 0;
		let modelOnly = 0;
		for (let i = 0; i < a.length; i += 1) {
			const inA = a[i] === 1;
			const inB = b[i] === 1;
			if (inA && inB) inter += 1;
			if (inA || inB) union += 1;
			if (!inA && inB) refOnly += 1;
			if (inA && !inB) modelOnly += 1;
		}
		const match = union ? inter / union * 100 : 0;
		const boundsOf = (s) => {
			const [minX, minY, maxX, maxY] = silhouetteBounds(s);
			return {
				w: Math.max(1, maxX - minX),
				h: Math.max(1, maxY - minY)
			};
		};
		const mb = boundsOf(model);
		const rb = boundsOf(reference);
		const aspectDelta = (mb.w / mb.h - rb.w / rb.h) / (rb.w / rb.h) * 100;
		const refArea = Math.max(1, refOnly + inter);
		const modelArea = Math.max(1, modelOnly + inter);
		const advice = [];
		if (match < 85) {
			if (refOnly / refArea > .25) advice.push("Add mass where the reference has silhouette your model lacks.");
			if (modelOnly / modelArea > .25) advice.push("Trim mass that sticks out beyond the reference.");
			if (Math.abs(aspectDelta) > 15) advice.push(aspectDelta > 0 ? `Model is too wide relative to its height (${aspectDelta.toFixed(0)}%); narrow it or add height.` : `Model is too narrow/tall (${aspectDelta.toFixed(0)}%); widen it or reduce height.`);
			if (!advice.length) advice.push("Match the overall proportions more closely, then re-measure.");
		}
		const verdict = match >= 90 ? "excellent" : match >= 85 ? "good" : match >= 70 ? "close" : match >= 50 ? "off" : "poor";
		return {
			match_percent: Number(match.toFixed(1)),
			aspect_delta_pct: Number(aspectDelta.toFixed(1)),
			ref_only_pct: Number((refOnly / refArea * 100).toFixed(1)),
			model_only_pct: Number((modelOnly / modelArea * 100).toFixed(1)),
			verdict,
			advice,
			grid_size: gridSize,
			model_mask: a,
			reference_mask: b
		};
	}
	function revisionFromPixels(data, width, height) {
		let hash = 2166136261;
		for (const value of data) {
			hash ^= value;
			hash = Math.imul(hash, 16777619) >>> 0;
		}
		for (const value of [
			width & 255,
			width >>> 8,
			height & 255,
			height >>> 8
		]) {
			hash ^= value;
			hash = Math.imul(hash, 16777619) >>> 0;
		}
		return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
	}
	function auditFacePixels(grid, opts = {}) {
		const findings = [];
		const height = grid.length;
		const width = grid[0]?.length ?? 0;
		const pixels = width * height;
		if (!pixels) return findings;
		const counts = new Map();
		let transparent = 0;
		let opaque = 0;
		let edgeAlpha = 0;
		let edgeCount = 0;
		let centerAlpha = 0;
		let centerCount = 0;
		for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
			const rgba = grid[y][x];
			const key = rgba.join(",");
			counts.set(key, (counts.get(key) ?? 0) + 1);
			if (rgba[3] === 0) transparent += 1;
			if (rgba[3] >= 230) opaque += 1;
			if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
				edgeAlpha += rgba[3];
				edgeCount += 1;
			} else {
				centerAlpha += rgba[3];
				centerCount += 1;
			}
		}
		const baseRatio = Math.max(...counts.values()) / pixels;
		if (transparent === pixels) findings.push({
			severity: "error",
			code: "EMPTY_FACE_TEXTURE",
			message: "Face is fully transparent and will not be visible."
		});
		if (counts.size > (opts.paletteLimit ?? 8)) findings.push({
			severity: "warn",
			code: "PALETTE_EXCESS",
			message: `${counts.size} exact RGBA colors exceed palette_limit ${opts.paletteLimit ?? 8}.`
		});
		if (baseRatio < (opts.minBaseRatio ?? .6)) findings.push({
			severity: "warn",
			code: "WEAK_BASE_COLOR",
			message: `Dominant color covers only ${(baseRatio * 100).toFixed(1)}%; material may read as noisy.`
		});
		if (counts.size === 1 && transparent !== pixels) findings.push({
			severity: "info",
			code: "FLAT_FACE",
			message: "Face is a uniform fill; verify that flat material is intentional."
		});
		if (opts.glass) {
			if (edgeAlpha / Math.max(1, edgeCount) <= centerAlpha / Math.max(1, centerCount)) findings.push({
				severity: "warn",
				code: "GLASS_EDGE_WEAK",
				message: "Glass edges are not more opaque than the center; the hollow form may disappear."
			});
			if (opaque / pixels > .35) findings.push({
				severity: "warn",
				code: "GLASS_TOO_OPAQUE",
				message: `${(opaque / pixels * 100).toFixed(1)}% of texels are near-opaque.`
			});
		}
		return findings;
	}
	//#endregion
	//#region ../shared/dist/index.js
	const PROTOCOL_NAME = "blockbench-mcp-pro";
	//#endregion
	//#region src/version.ts
	const PLUGIN_VERSION = "1.0.1";
	//#endregion
	//#region src/config.ts
	const TOKEN_STORAGE_KEY = "bbmcp_secret";
	function readStorage(key) {
		try {
			return localStorage?.getItem(key) ?? "";
		} catch {
			return "";
		}
	}
	function writeStorage(key, value) {
		try {
			localStorage?.setItem(key, value);
		} catch {}
	}
	function randomSecret() {
		const bytes = new Uint8Array(24);
		const cryptoApi = globalThis.crypto;
		if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
		else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
		return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
	}
	function ensureSecret() {
		const stored = readStorage(TOKEN_STORAGE_KEY);
		const fromSetting = typeof settings?.bbmcp_secret?.value === "string" ? settings.bbmcp_secret.value : "";
		const secret = fromSetting.length >= 16 && fromSetting !== stored ? fromSetting : stored.length >= 16 ? stored : randomSecret();
		if (secret !== stored) writeStorage(TOKEN_STORAGE_KEY, secret);
		if (settings?.bbmcp_secret && fromSetting !== secret) settings.bbmcp_secret.value = secret;
		return secret;
	}
	function readConfig() {
		const portRaw = settings?.bbmcp_port?.value;
		const port = typeof portRaw === "number" ? portRaw : Number(portRaw ?? DEFAULTS.mcpPort);
		return {
			port: Number.isFinite(port) ? port : DEFAULTS.mcpPort,
			secret: ensureSecret(),
			autostart: settings?.bbmcp_autostart?.value !== false,
			allowExecuteScript: Boolean(settings?.bbmcp_allow_execute_script?.value)
		};
	}
	function registerSettings() {
		if (typeof Setting !== "function") return;
		new Setting("bbmcp_port", {
			value: DEFAULTS.mcpPort,
			category: "general",
			name: "MCP Server Port",
			description: "Loopback HTTP port for the in-process MCP server (127.0.0.1).",
			type: "number"
		});
		new Setting("bbmcp_secret", {
			value: "",
			category: "general",
			name: "MCP Access Token",
			description: "Bearer token every MCP client must send. Generated randomly on first load — copy it into your client config.",
			type: "text"
		});
		new Setting("bbmcp_autostart", {
			value: true,
			category: "general",
			name: "Start MCP Server on launch",
			description: "Listen for MCP clients as soon as the plugin loads.",
			type: "toggle"
		});
		new Setting("bbmcp_allow_execute_script", {
			value: false,
			category: "general",
			name: "Allow execute_script",
			description: "Off by default. When on, an MCP client can run arbitrary JavaScript inside Blockbench with full privileges.",
			type: "toggle"
		});
	}
	//#endregion
	//#region src/errors.ts
	var CommandError = class extends Error {
		code;
		details;
		constructor(code, message, details) {
			super(message);
			this.code = code;
			this.details = details;
		}
		toPayload() {
			return makeError(this.code, this.message, this.details);
		}
	};
	function toErrorPayload(err) {
		if (err instanceof CommandError) return err.toPayload();
		if (err instanceof Error) {
			const code = err.code;
			return makeError(code ?? "E_BLOCKBENCH_ERROR", err.message);
		}
		return makeError("E_BLOCKBENCH_ERROR", String(err));
	}
	//#endregion
	//#region src/host.ts
	function requireNodeModule(name) {
		const loader = typeof require === "function" ? require : globalThis.require;
		if (!loader) throw new CommandError("E_BLOCKBENCH_ERROR", "Node modules unavailable — use the Blockbench DESKTOP app.");
		try {
			const value = loader(name);
			if (!value) throw new Error("denied");
			return value;
		} catch {
			throw new CommandError("E_BLOCKBENCH_ERROR", `Node module "${name}" unavailable; allow this plugin's desktop module permission and retry.`);
		}
	}
	function toast(message, ms = 3e3) {
		try {
			Blockbench?.showQuickMessage?.(message, ms);
		} catch {}
	}
	function withUndo(aspects, label, fn) {
		const created = {
			elements: [],
			textures: [],
			animations: []
		};
		const track = {
			addElements: (els) => created.elements.push(...els),
			addTextures: (texs) => created.textures.push(...texs),
			addAnimations: (anims) => created.animations.push(...anims)
		};
		const init = {
			elements: [],
			textures: [],
			animations: [],
			...aspects
		};
		for (const key of [
			"elements",
			"textures",
			"animations"
		]) if (!Array.isArray(init[key])) init[key] = [];
		let started = false;
		try {
			Undo.initEdit(init);
			started = true;
		} catch {
			started = false;
		}
		try {
			const result = fn(track);
			if (started) {
				const finish = { ...init };
				const existing = Array.isArray(finish.elements) ? finish.elements : [];
				const native = created.elements.filter((el) => el && typeof el === "object" && "getUndoCopy" in el);
				if (native.length) finish.elements = [...existing, ...native];
				const nativeTex = created.textures.filter((t) => t && typeof t === "object" && "getUndoCopy" in t);
				if (nativeTex.length) finish.textures = [...finish.textures ?? [], ...nativeTex];
				if (created.animations.length) {
					const live = created.animations.filter((a) => a && typeof a === "object" && "name" in a).map((a) => Animation?.all?.find?.((x) => x.name === a.name)).filter(Boolean);
					if (live.length) finish.animations = live;
				}
				Undo.finishEdit(label, finish);
			}
			return result;
		} catch (err) {
			if (started) try {
				Undo.cancelEdit?.(true);
			} catch {}
			throw err;
		}
	}
	function canvasOf(tex) {
		const canvas = tex?.canvas ?? tex?.getCanvas?.();
		if (!canvas) throw new CommandError("E_BLOCKBENCH_ERROR", "Texture has no canvas");
		return canvas;
	}
	function wrapTexture(tex) {
		return {
			uuid: tex.uuid,
			name: tex.name,
			width: tex.width ?? tex.canvas?.width ?? 16,
			height: tex.height ?? tex.canvas?.height ?? 16,
			raw: tex,
			edit(fn, label) {
				if (typeof tex.edit === "function") {
					tex.edit((canvas) => {
						const ctx = canvas.getContext("2d");
						if (ctx) fn(ctx, canvas);
					}, { edit_name: label });
					tex.updateChangesAfterEdit?.();
					return;
				}
				const canvas = canvasOf(tex);
				const ctx = canvas.getContext("2d");
				if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
				fn(ctx, canvas);
				tex.updateChangesAfterEdit?.();
			},
			read(fn) {
				const canvas = canvasOf(tex);
				const ctx = canvas.getContext("2d");
				if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
				return fn(ctx, canvas);
			},
			applyToCube(cubeUuid, faces = true) {
				const cube = Cube?.all?.find?.((c) => c.uuid === cubeUuid);
				if (!cube) throw new CommandError("E_NOT_FOUND", `Cube not found: ${cubeUuid}`);
				cube.applyTexture(tex, faces);
			},
			toDataURL(maxEdge = 256) {
				const canvas = canvasOf(tex);
				const w = canvas.width || tex.width || 16;
				const h = canvas.height || tex.height || 16;
				const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
				if (scale >= .999) return canvas.toDataURL("image/png");
				const out = document.createElement("canvas");
				out.width = Math.max(1, Math.round(w * scale));
				out.height = Math.max(1, Math.round(h * scale));
				const ctx = out.getContext("2d");
				if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(canvas, 0, 0, out.width, out.height);
				return out.toDataURL("image/png");
			}
		};
	}
	function findTexture(ref) {
		const all = Texture?.all ?? [];
		const hit = ref ? all.find((t) => t.uuid === ref || t.name === ref) : Texture?.getDefault?.() ?? all[0];
		return hit ? wrapTexture(hit) : void 0;
	}
	function listTextures() {
		return (Texture?.all ?? []).map((t) => wrapTexture(t));
	}
	function createTexture(opts) {
		const existing = findTexture(opts.name);
		if (existing) return existing;
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(opts.width));
		canvas.height = Math.max(1, Math.round(opts.height));
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
		if (opts.fill) {
			ctx.fillStyle = opts.fill;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		const tex = new Texture({ name: opts.name });
		tex.width = canvas.width;
		tex.height = canvas.height;
		const dataUrl = canvas.toDataURL("image/png");
		if (typeof tex.fromDataURL === "function") tex.fromDataURL(dataUrl);
		else throw new CommandError("E_BLOCKBENCH_ERROR", "Texture.fromDataURL missing — need Blockbench ≥ 5.1");
		tex.add(false);
		return wrapTexture(tex);
	}
	function refreshCanvas(elements) {
		try {
			if (elements?.length && typeof Canvas?.updateView === "function") {
				const uuids = new Set(elements.map((e) => e.uuid));
				const cubes = (Cube?.all ?? []).filter((c) => uuids.has(c.uuid));
				const groups = (Group?.all ?? []).filter((g) => uuids.has(g.uuid));
				const expand = (group) => {
					for (const child of group.children ?? []) {
						uuids.add(child.uuid);
						if (child.children) expand(child);
					}
				};
				for (const group of groups) expand(group);
				Canvas.updateView({
					elements: cubes,
					groups,
					element_aspects: {
						geometry: true,
						uv: true,
						faces: true,
						transform: true,
						visibility: true
					},
					group_aspects: {
						transform: true,
						visibility: true
					},
					selection: false
				});
				Canvas.updateAll?.();
				return;
			}
			Canvas?.updateAll?.();
		} catch {
			try {
				Canvas?.updateAll?.();
			} catch {}
		}
	}
	function currentFormatId() {
		return Format?.id ?? null;
	}
	function listFormats() {
		const formats = Formats ?? {};
		return Object.entries(formats).map(([key, value]) => ({
			id: value?.id ?? key,
			name: value?.name ?? value?.display_name ?? value?.id ?? key,
			box_uv: typeof value?.box_uv === "boolean" ? value.box_uv : null
		})).sort((a, b) => a.id.localeCompare(b.id));
	}
	function hasGeckoLib() {
		if (!Formats) return false;
		if (Formats.geckolib_model) return true;
		return Object.keys(Formats).some((id) => id.toLowerCase().includes("gecko"));
	}
	function createProject(opts) {
		let formatId = opts.format;
		let formatApi = Formats?.[formatId];
		if (!formatApi && opts.format === "geckolib_model") {
			const hit = Object.keys(Formats ?? {}).find((k) => k.toLowerCase().includes("gecko"));
			if (!hit) throw new CommandError("E_UNSUPPORTED_FORMAT", "Install the GeckoLib Blockbench plugin first (install_plugin {id:'geckolib'}).");
			formatId = hit;
			formatApi = Formats[hit];
		}
		if (!formatApi) throw new CommandError("E_UNSUPPORTED_FORMAT", `Unknown format "${opts.format}"; call list_formats for valid ids.`);
		if (typeof newProject !== "function") throw new CommandError("E_BLOCKBENCH_ERROR", "newProject() unavailable in this Blockbench build.");
		const wantsBox = opts.uv_mode === "box" || opts.uv_mode !== "face" && formatApi.box_uv === true;
		if (opts.uv_mode && opts.uv_mode !== "auto") {
			if (!(formatApi.optional_box_uv !== false) && typeof formatApi.box_uv === "boolean" && opts.uv_mode === "box" !== formatApi.box_uv) throw new CommandError("E_INVALID_PARAM", `Format "${formatId}" does not support uv_mode "${opts.uv_mode}".`);
		}
		if (opts.uv_mode === "box" && formatId === "java_block") throw new CommandError("E_INVALID_PARAM", "java_block requires uv_mode 'face'.");
		const before = Project;
		if (newProject(formatApi) === false) throw new CommandError("E_BLOCKBENCH_ERROR", "Project creation was cancelled.");
		const created = Project;
		if (!created || created === before) throw new CommandError("E_BLOCKBENCH_ERROR", "A new project was not created.");
		if (opts.name) created.name = opts.name;
		if (opts.geometry_name) created.geometry_name = opts.geometry_name;
		created.box_uv = wantsBox;
		if (opts.texture_width) created.texture_width = Math.round(opts.texture_width);
		if (opts.texture_height) created.texture_height = Math.round(opts.texture_height);
		return {
			format: Format?.id ?? formatId,
			name: created.name,
			uv_mode: created.box_uv ? "box" : "face"
		};
	}
	function captureView(view, size) {
		return new Promise((resolve, reject) => {
			const preview = Screencam?.NoAAPreview;
			if (!preview || typeof Screencam?.screenshotPreview !== "function") {
				reject(new CommandError("E_BLOCKBENCH_ERROR", "Offscreen screenshot API unavailable (Screencam.NoAAPreview)."));
				return;
			}
			const timeout = setTimeout(() => reject(new CommandError("E_TIMEOUT", "Screenshot timed out")), 2e4);
			try {
				const frame = framing(view);
				preview.loadAnglePreset(frame.preset);
				const cam = preview.camOrtho;
				cam.zoom = Math.min(cam.right - cam.left, cam.top - cam.bottom) / frame.span;
				cam.near = .01;
				cam.far = Math.max(1e3, frame.span * 10 + 128);
				cam.updateProjectionMatrix();
				preview.render?.();
				Screencam.screenshotPreview(preview, {
					width: size,
					height: size,
					crop: false
				}, (url) => {
					clearTimeout(timeout);
					const image = new Image();
					image.onload = () => resolve({
						dataUrl: url,
						width: image.naturalWidth || size,
						height: image.naturalHeight || size
					});
					image.onerror = () => resolve({
						dataUrl: url,
						width: size,
						height: size
					});
					image.src = url;
				});
			} catch (err) {
				clearTimeout(timeout);
				reject(err);
			}
		});
	}
	function framing(view) {
		const cubes = (Cube?.all ?? []).filter((cube) => {
			if (cube.visibility === false) return false;
			let parent = cube.parent;
			let guard = 0;
			while (parent && parent !== "root" && typeof parent !== "string" && guard < 32) {
				if (parent.visibility === false) return false;
				parent = parent.parent;
				guard += 1;
			}
			return true;
		});
		const points = [];
		for (const cube of cubes) {
			const inflate = cube.inflate ?? 0;
			const lo = cube.from.map((v, i) => Math.min(v, cube.to[i]) - inflate);
			const hi = cube.from.map((v, i) => Math.max(v, cube.to[i]) + inflate);
			for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) points.push([
				x,
				y,
				z
			]);
		}
		const min = [
			0,
			1,
			2
		].map((i) => points.length ? Math.min(...points.map((p) => p[i])) : -8);
		const max = [
			0,
			1,
			2
		].map((i) => points.length ? Math.max(...points.map((p) => p[i])) : 8);
		const center = min.map((v, i) => (v + max[i]) / 2);
		const radius = Math.max(1, ...points.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])));
		const directions = {
			north: [
				0,
				0,
				-1
			],
			south: [
				0,
				0,
				1
			],
			east: [
				1,
				0,
				0
			],
			west: [
				-1,
				0,
				0
			],
			up: [
				0,
				1,
				1e-4
			],
			down: [
				0,
				-1,
				1e-4
			],
			iso: [
				1,
				.8,
				1
			]
		};
		const dir = directions[view] ?? directions.iso;
		const distance = radius * 4 + 64;
		const length = Math.hypot(dir[0], dir[1], dir[2]);
		return {
			preset: {
				projection: "orthographic",
				position: center.map((v, i) => v + dir[i] / length * distance),
				target: center
			},
			span: radius * 2.3
		};
	}
	function showBlockingDialog(opts) {
		let close = () => {};
		return {
			result: new Promise((resolve) => {
				if (typeof Dialog === "function") try {
					let settled = false;
					const finish = (index) => {
						if (settled) return;
						settled = true;
						try {
							dialog.hide?.();
						} catch {}
						resolve({ index });
					};
					const dialog = new Dialog({
						id: opts.id,
						title: opts.title,
						lines: [opts.message, ...opts.lines ?? []],
						buttons: opts.buttons,
						onButton: (index) => finish(index),
						onCancel: () => finish(-1)
					});
					close = () => {
						try {
							dialog.hide?.();
						} catch {}
					};
					dialog.show?.();
					return;
				} catch {}
				try {
					Blockbench.showMessageBox({
						title: opts.title,
						message: opts.message,
						buttons: opts.buttons,
						confirm: 0,
						cancel: opts.buttons.length - 1
					}, (button) => resolve({ index: typeof button === "number" ? button : Number(button) }));
				} catch {
					resolve({ index: -1 });
				}
			}),
			close: () => close()
		};
	}
	//#endregion
	//#region src/bb.ts
	function requireProject() {
		if (!Project) throw new CommandError("E_NOT_FOUND", "No project is open. Call create_project first.");
	}
	function findGroup(ref) {
		return (Group?.all ?? []).find((g) => g.uuid === ref || g.name === ref);
	}
	function findCube(ref) {
		return (Cube?.all ?? []).find((c) => c.uuid === ref || c.name === ref);
	}
	function findElement(ref) {
		return findGroup(ref) ?? findCube(ref);
	}
	function requireElement(ref) {
		const element = findElement(ref);
		if (!element) throw new CommandError("E_NOT_FOUND", `Element not found: ${ref}. Use get_project_summary or get_elements for valid names/uuids.`);
		return element;
	}
	function requireGroup(ref) {
		const group = findGroup(ref);
		if (!group) throw new CommandError("E_NOT_FOUND", `Group/bone not found: ${ref}`);
		return group;
	}
	function requireCube(ref) {
		const cube = findCube(ref);
		if (!cube) throw new CommandError("E_NOT_FOUND", `Cube not found: ${ref}`);
		return cube;
	}
	function parentOf(ref) {
		if (!ref || ref === "root") return "root";
		return requireGroup(ref);
	}
	function parentUuid(parent) {
		if (!parent || parent === "root") return null;
		return typeof parent === "string" ? parent : parent.uuid ?? null;
	}
	function snapshotElements(refs) {
		const wanted = refs?.length ? new Set(refs) : null;
		const match = (el) => !wanted || wanted.has(el.uuid) || wanted.has(el.name);
		const out = [];
		for (const group of Group?.all ?? []) {
			if (!match(group)) continue;
			out.push({
				uuid: group.uuid,
				name: group.name,
				type: "group",
				parent: parentUuid(group.parent),
				origin: [...group.origin ?? [
					0,
					0,
					0
				]],
				rotation: [...group.rotation ?? [
					0,
					0,
					0
				]],
				visibility: group.visibility !== false
			});
		}
		const textureWidth = Project?.texture_width ?? 16;
		const textureHeight = Project?.texture_height ?? 16;
		for (const cube of Cube?.all ?? []) {
			if (!match(cube)) continue;
			const faces = cube.faces ?? {};
			const untextured = FACE_NAMES.filter((face) => {
				const f = faces[face];
				return f && (f.texture === null || f.texture === void 0 || f.texture === false);
			});
			let outOfBounds = 0;
			for (const face of FACE_NAMES) {
				const uv = faces[face]?.uv;
				if (!Array.isArray(uv) || uv.length < 4) continue;
				if (Math.min(uv[0], uv[2]) < 0 || Math.min(uv[1], uv[3]) < 0 || Math.max(uv[0], uv[2]) > textureWidth || Math.max(uv[1], uv[3]) > textureHeight) outOfBounds += 1;
			}
			out.push({
				uuid: cube.uuid,
				name: cube.name,
				type: "cube",
				parent: parentUuid(cube.parent),
				origin: [...cube.origin ?? cube.from ?? [
					0,
					0,
					0
				]],
				rotation: [...cube.rotation ?? [
					0,
					0,
					0
				]],
				from: [...cube.from ?? [
					0,
					0,
					0
				]],
				to: [...cube.to ?? [
					0,
					0,
					0
				]],
				inflate: cube.inflate ?? 0,
				visibility: cube.visibility !== false,
				untexturedFaces: untextured,
				faceUvOutOfBounds: outOfBounds
			});
		}
		return out;
	}
	function uvIslands() {
		return collectUvIslands((Cube?.all ?? []).map((cube) => ({
			uuid: cube.uuid,
			name: cube.name,
			from: [...cube.from],
			to: [...cube.to],
			faces: cube.faces ?? {}
		})), Project?.texture_width ?? 16, Project?.texture_height ?? 16);
	}
	function resolveUvMode(explicit) {
		return resolveUvModeFromHints({
			explicit,
			projectBoxUv: typeof Project?.box_uv === "boolean" ? Project.box_uv : null,
			formatBoxUv: typeof Format?.box_uv === "boolean" ? Format.box_uv : null,
			formatId: currentFormatId(),
			cubeBoxFlags: (Cube?.all ?? []).map((c) => Boolean(c.box_uv))
		});
	}
	function getElements(opts) {
		const wanted = opts.refs?.length ? new Set(opts.refs) : null;
		const match = (el) => !wanted || wanted.has(el.uuid) || wanted.has(el.name);
		return {
			groups: (Group?.all ?? []).filter(match).map((group) => ({
				uuid: group.uuid,
				name: group.name,
				parent: parentUuid(group.parent),
				origin: [...group.origin ?? []],
				rotation: [...group.rotation ?? []],
				visibility: group.visibility !== false,
				children: (group.children ?? []).map((c) => c.uuid)
			})),
			cubes: (Cube?.all ?? []).filter(match).map((cube) => ({
				uuid: cube.uuid,
				name: cube.name,
				parent: parentUuid(cube.parent),
				from: [...cube.from ?? []],
				to: [...cube.to ?? []],
				origin: [...cube.origin ?? []],
				rotation: [...cube.rotation ?? []],
				inflate: cube.inflate ?? 0,
				visibility: cube.visibility !== false,
				box_uv: cube.box_uv ?? false,
				uv_offset: cube.uv_offset ? [...cube.uv_offset] : null,
				mirror_uv: cube.mirror_uv ?? false,
				faces: Object.fromEntries(Object.entries(cube.faces ?? {}).map(([name, face]) => [name, {
					uv: face?.uv ? [...face.uv] : null,
					rotation: face?.rotation ?? 0,
					texture: face?.texture == null ? null : typeof face.texture === "string" ? face.texture : face.texture.uuid ?? face.texture.name ?? "assigned"
				}]))
			}))
		};
	}
	function projectSummary() {
		requireProject();
		const outliner = [...(Group?.all ?? []).map((g) => ({
			uuid: g.uuid,
			name: g.name,
			type: "group",
			parent: parentUuid(g.parent)
		})), ...(Cube?.all ?? []).map((c) => ({
			uuid: c.uuid,
			name: c.name,
			type: "cube",
			parent: parentUuid(c.parent)
		}))];
		return {
			format: currentFormatId() ?? "unknown",
			name: Project?.name ?? null,
			geometry_name: Project?.geometry_name ?? null,
			texture_width: Project?.texture_width ?? null,
			texture_height: Project?.texture_height ?? null,
			uv_mode: resolveUvMode(),
			cubes: (Cube?.all ?? []).length,
			groups: (Group?.all ?? []).length,
			textures: (Texture?.all ?? []).length,
			animations: (Animation?.all ?? []).length,
			outliner
		};
	}
	function orientationInfo() {
		return {
			faces: "-Z (north) is the model's front",
			model_right_axis: "+X",
			model_left_axis: "-X",
			front_view_mirror_trap: "A 'front' render shows the model mirrored: its right hand appears on the LEFT of the image, exactly like facing a person.",
			rotation_signs: {
				"+X": "lifts the front: a DOWN-pointing bone (arm/leg) swings its tip FORWARD; an UP-pointing bone (torso/neck) tips BACKWARD",
				"+Y": "turns the model toward its own left",
				"+Z": "rolls the model toward its own right",
				elbows: "+X",
				knees: "-X"
			},
			side_param: "apply_geometry_batch / generators accept side:'left'|'right' and REFUSE coordinates that contradict it."
		};
	}
	function sideOfX(x) {
		if (x > .001) return "right";
		if (x < -.001) return "left";
		return null;
	}
	function assertSide(declared, x, what) {
		if (!declared) return;
		const actual = sideOfX(x);
		if (actual && actual !== declared) throw new CommandError("E_INVALID_PARAM", `${what} was declared side:"${declared}" but sits at x=${x} (the model's ${actual}). The model faces -Z, so its OWN right is +X.`);
	}
	function sideSuffix(name, side) {
		if (!side) return name;
		if (/(left|right)/i.test(name)) return name;
		return `${name}_${side}`;
	}
	function materialize(opts) {
		requireProject();
		const label = opts.undo_label ?? "blockbench-mcp batch";
		const pendingGroups = new Set([...(opts.create_groups ?? []).map((g) => g.name), ...(opts.generated_groups ?? []).map((g) => g.name)]);
		const known = (ref) => !ref || ref === "root" || pendingGroups.has(ref) || Boolean(findGroup(ref));
		for (const group of [...opts.generated_groups ?? [], ...opts.create_groups ?? []]) if (!known(group.parent)) throw new CommandError("E_PARTIAL_FORBIDDEN", `Missing parent group: ${group.parent}`);
		for (const cube of opts.create_cubes ?? []) {
			if (!known(cube.parent)) throw new CommandError("E_PARTIAL_FORBIDDEN", `Missing parent group for cube ${cube.name}: ${cube.parent}`);
			assertSide(cube.side, cube.from[0], `Cube "${cube.name}"`);
		}
		for (const ref of opts.delete_refs ?? []) if (!findElement(ref)) throw new CommandError("E_PARTIAL_FORBIDDEN", `Cannot delete missing element: ${ref}`);
		const boxUv = resolveUvMode() === "box";
		const targetTexture = findTexture(opts.texture ?? void 0);
		return withUndo({ outliner: true }, label, (track) => {
			const created = [];
			const nameToGroup = new Map();
			const resolveParent = (ref) => {
				if (!ref || ref === "root") return "root";
				return nameToGroup.get(ref) ?? findGroup(ref) ?? "root";
			};
			for (const spec of [...opts.generated_groups ?? [], ...(opts.create_groups ?? []).map((g) => ({
				name: g.name,
				origin: g.origin ?? [
					0,
					0,
					0
				],
				rotation: g.rotation ?? [
					0,
					0,
					0
				],
				parent: g.parent
			}))]) {
				const group = new Group({
					name: spec.name,
					origin: [...spec.origin],
					rotation: [...spec.rotation]
				}).init().addTo(resolveParent(spec.parent));
				group.createUniqueName?.();
				nameToGroup.set(spec.name, group);
				nameToGroup.set(group.name, group);
				const row = {
					uuid: group.uuid,
					name: group.name,
					type: "group"
				};
				created.push(row);
				track.addElements([group]);
			}
			for (const spec of opts.create_cubes ?? []) {
				const cube = new Cube({
					name: spec.name,
					from: [...spec.from],
					to: [...spec.to],
					origin: spec.origin ? [...spec.origin] : [...spec.from],
					rotation: spec.rotation ? [...spec.rotation] : [
						0,
						0,
						0
					],
					inflate: spec.inflate ?? 0,
					autouv: opts.auto_uv === false ? 0 : 1,
					box_uv: boxUv
				}).init().addTo(resolveParent(spec.parent));
				cube.createUniqueName?.();
				cube.mapAutoUV?.();
				if (targetTexture) targetTexture.applyToCube(cube.uuid, true);
				const row = {
					uuid: cube.uuid,
					name: cube.name,
					type: "cube"
				};
				created.push(row);
				track.addElements([cube]);
			}
			const deleted = [];
			for (const ref of opts.delete_refs ?? []) {
				const element = findElement(ref);
				if (!element) continue;
				deleted.push(element.uuid);
				element.remove?.(false);
			}
			refreshCanvas(created);
			return {
				ok: true,
				undo_label: label,
				created,
				deleted
			};
		});
	}
	//#endregion
	//#region src/tools/status.ts
	function probeCapabilities() {
		const caps = ["geometry"];
		try {
			listTextures();
			caps.push("textures");
		} catch {}
		if (typeof Screencam.screenshotPreview === "function") caps.push("screenshots");
		if ("edit" in Painter) caps.push("painter");
		if (hasGeckoLib()) caps.push("geckolib");
		if (Animation?.all) caps.push("animations");
		try {
			requireNodeModule("fs");
			caps.push("filesystem");
		} catch {}
		return caps;
	}
	const statusTools = {
		health: () => ({
			ok: true,
			server: PROTOCOL_NAME,
			plugin_version: PLUGIN_VERSION,
			protocol_version: 1,
			mcp_protocol_version: "2024-11-05",
			blockbench_version: Blockbench?.version ?? "unknown",
			blockbench_supported: isBlockbenchSupported(Blockbench?.version ?? "0.0.0"),
			min_blockbench_version: MIN_BLOCKBENCH_VERSION,
			transport: ["streamable-http (in-process)", "stdio gateway"],
			default_port: DEFAULTS.mcpPort,
			project_open: Boolean(Project),
			format: currentFormatId(),
			uv_mode: Project ? resolveUvMode() : null,
			capabilities: probeCapabilities(),
			execute_script_allowed: Boolean(settings?.bbmcp_allow_execute_script?.value)
		}),
		get_guide: (args) => resolveGuide(args?.topic),
		list_formats: () => ({ formats: listFormats() }),
		get_project_summary: () => projectSummary(),
		get_elements: (args) => getElements(args ?? {}),
		list_textures: () => ({ textures: listTextures().map((t) => ({
			uuid: t.uuid,
			name: t.name,
			width: t.width,
			height: t.height
		})) }),
		list_animations: () => {
			requireProject();
			return { animations: (Animation?.all ?? []).map((animation) => {
				const animators = Object.values(animation.animators ?? {});
				return {
					name: animation.name,
					length: animation.length ?? 0,
					loop: animation.loop ?? "once",
					bones: animators.length,
					keyframes: animators.reduce((sum, a) => sum + (a?.rotations?.length ?? 0) + (a?.position?.length ?? 0) + (a?.scale?.length ?? 0), 0)
				};
			}) };
		},
		get_orientation: () => orientationInfo(),
		which_side: (args) => {
			requireProject();
			const element = findElement(args?.element);
			if (!element) throw new CommandError("E_NOT_FOUND", `Element not found: ${args?.element}`);
			const x = element.origin?.[0] ?? element.from?.[0] ?? 0;
			const actual = x > .001 ? "right" : x < -.001 ? "left" : "center";
			const name = String(element.name ?? "");
			const named = nameSide(name);
			return {
				element: name,
				coordinate_axis: "x",
				signed_x: x,
				side: actual,
				name_says: named,
				name_agrees: named === null ? null : named === actual,
				note: "The model faces -Z, so its OWN right is +X. A front-view render is mirrored."
			};
		},
		check_sides: () => {
			requireProject();
			return checkSides(snapshotElements());
		}
	};
	//#endregion
	//#region src/session.ts
	const session = {
		scopedDirectory: null,
		references: [],
		pending: new Map(),
		activity: [],
		reviewSeq: 0,
		referenceSeq: 0
	};
	function fsApi() {
		const fs = requireNodeModule("fs");
		if (!fs?.existsSync || !fs.readFileSync || !fs.writeFileSync) throw new CommandError("E_BLOCKBENCH_ERROR", "Filesystem not available (use the desktop app).");
		return fs;
	}
	function pathApi() {
		const path = requireNodeModule("path");
		if (!path?.resolve || !path.relative) throw new CommandError("E_BLOCKBENCH_ERROR", "path module unavailable (use the desktop app).");
		return path;
	}
	function scopedPath(target) {
		if (!session.scopedDirectory) throw new CommandError("E_SCOPE_DENIED", "Call propose_scoped_directory first and get the user's approval (the user must click Allow).");
		const paths = pathApi();
		if (!paths.isAbsolute(target)) throw new CommandError("E_SCOPE_DENIED", "Destination path must be absolute.");
		const root = paths.resolve(session.scopedDirectory);
		const resolved = paths.resolve(target);
		const relative = paths.relative(root, resolved);
		if (relative === ".." || relative.startsWith("..\\") || relative.startsWith("../") || paths.isAbsolute(relative)) throw new CommandError("E_SCOPE_DENIED", `Path must stay inside the approved directory: ${root}`);
		return resolved;
	}
	function readScopedFile(target) {
		const resolved = scopedPath(target);
		const fs = fsApi();
		if (!fs.existsSync(resolved)) throw new CommandError("E_NOT_FOUND", `File not found: ${resolved}`);
		return fs.readFileSync(resolved);
	}
	function writeScopedFile(target, data, overwrite) {
		const resolved = scopedPath(target);
		const fs = fsApi();
		if (fs.existsSync(resolved) && overwrite !== true) throw new CommandError("E_SCOPE_DENIED", `File exists; pass overwrite:true — ${resolved}`);
		fs.writeFileSync(resolved, data);
		return {
			path: resolved,
			bytes: typeof data === "string" ? new TextEncoder().encode(data).byteLength : data.byteLength
		};
	}
	function newReviewId() {
		session.reviewSeq += 1;
		return `rev-${Date.now().toString(36)}-${session.reviewSeq}`;
	}
	function openReview(entry) {
		const review = {
			id: newReviewId(),
			kind: entry.kind,
			title: entry.title,
			question: entry.question,
			options: entry.options,
			createdAt: Date.now(),
			expiresAt: Date.now() + Math.max(5, entry.timeoutSeconds) * 1e3,
			resolve: entry.resolve
		};
		session.pending.set(review.id, review);
		if (session.pending.size > 50) {
			const oldest = [...session.pending.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
			if (oldest && !oldest.resolve) session.pending.delete(oldest.id);
		}
		return review;
	}
	function answerReview(id, index, comment) {
		const review = session.pending.get(id);
		if (!review) return void 0;
		if (index < 0) {
			dismissReview(review);
			return review;
		}
		review.answer = {
			index,
			option: review.options[index] ?? String(index),
			comment,
			at: Date.now()
		};
		review.resolve?.(review.answer);
		return review;
	}
	function dismissReview(review) {
		review.dismissed = true;
		review.resolve?.({
			index: -1,
			option: "dismissed",
			at: Date.now()
		});
	}
	function latestOpenReview(includeAnswered = false) {
		const all = [...session.pending.values()].sort((a, b) => b.createdAt - a.createdAt);
		return includeAnswered ? all[0] : all.find((r) => !r.answer);
	}
	function reviewPayload(review, waitSeconds) {
		return {
			review_id: review.id,
			kind: review.kind,
			title: review.title,
			question: review.question,
			options: review.options,
			answered: Boolean(review.answer),
			answer: review.answer?.option ?? null,
			answer_index: review.answer?.index ?? null,
			comment: review.answer?.comment ?? null,
			pending: !review.answer,
			dismissed: Boolean(review.dismissed),
			waited_seconds: waitSeconds,
			seconds_until_card_closes: Math.max(0, Math.round((review.expiresAt - Date.now()) / 1e3))
		};
	}
	async function waitForReview(review, waitSeconds) {
		if (review.answer) return review;
		await new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				resolve();
			};
			const timer = setTimeout(finish, Math.max(.05, waitSeconds) * 1e3);
			const previous = review.resolve;
			review.resolve = (answer) => {
				previous?.(answer);
				finish();
			};
		});
		return review;
	}
	//#endregion
	//#region src/tools/project.ts
	const CODECS = {
		project: () => Codecs?.project,
		gltf: () => Codecs?.gltf ?? Codecs?.glTF
	};
	function codecFor(name) {
		if (name && CODECS[name]) {
			const codec = CODECS[name]();
			if (codec) return {
				id: name,
				codec
			};
		}
		if (name && Codecs?.[name]) return {
			id: name,
			codec: Codecs[name]
		};
		const current = Format?.codec;
		if (current) return {
			id: current.id ?? Format?.id ?? "format",
			codec: current
		};
		if (Codecs?.project) return {
			id: "project",
			codec: Codecs.project
		};
		throw new CommandError("E_UNSUPPORTED_FORMAT", `No export codec available${name ? ` for "${name}"` : ""}.`);
	}
	function serialize(content) {
		if (typeof content === "string" || content instanceof Uint8Array) return content;
		if (content === void 0 || content === null) throw new CommandError("E_BLOCKBENCH_ERROR", "Codec returned no content.");
		return JSON.stringify(content, null, 2);
	}
	const projectTools = {
		create_project: (args) => {
			return {
				ok: true,
				...createProject(args),
				note: "Existing project tabs were preserved. Call get_project_summary to confirm uv_mode, then check_model after the first geometry pass."
			};
		},
		set_project_meta: (args) => {
			requireProject();
			const oldW = Project.texture_width ?? 16;
			const oldH = Project.texture_height ?? 16;
			const newW = args?.texture_width ?? oldW;
			const newH = args?.texture_height ?? oldH;
			const resizing = newW !== oldW || newH !== oldH;
			const scaleX = newW / oldW;
			const scaleY = newH / oldH;
			return withUndo({
				elements: [...Cube?.all ?? []],
				textures: [...Texture?.all ?? []],
				bitmap: true,
				uv_only: true
			}, "set_project_meta", () => {
				if (args?.name !== void 0) Project.name = args.name;
				if (args?.geometry_name !== void 0) Project.geometry_name = args.geometry_name;
				if (resizing) {
					for (const cube of Cube?.all ?? []) {
						if (Array.isArray(cube.uv_offset)) cube.uv_offset = [cube.uv_offset[0] * scaleX, cube.uv_offset[1] * scaleY];
						for (const face of Object.values(cube.faces ?? {})) {
							if (!Array.isArray(face?.uv)) continue;
							face.uv = [
								face.uv[0] * scaleX,
								face.uv[1] * scaleY,
								face.uv[2] * scaleX,
								face.uv[3] * scaleY
							];
						}
					}
					Project.texture_width = Math.round(newW);
					Project.texture_height = Math.round(newH);
					for (const texture of Texture?.all ?? []) texture.edit?.((canvas) => {
						const ctx = canvas.getContext("2d");
						if (!ctx) return;
						const previous = document.createElement("canvas");
						previous.width = canvas.width;
						previous.height = canvas.height;
						previous.getContext("2d")?.drawImage(canvas, 0, 0);
						canvas.width = Math.round(newW);
						canvas.height = Math.round(newH);
						ctx.imageSmoothingEnabled = false;
						ctx.clearRect(0, 0, canvas.width, canvas.height);
						ctx.drawImage(previous, 0, 0, canvas.width, canvas.height);
					}, { edit_name: "set_project_meta resize" });
					refreshCanvas();
				}
				return {
					ok: true,
					name: Project.name,
					texture_size: [Project.texture_width, Project.texture_height],
					uv_scaled: resizing ? [scaleX, scaleY] : null
				};
			});
		},
		propose_scoped_directory: async (args) => {
			const paths = pathApi();
			if (!paths.isAbsolute(args?.path)) throw new CommandError("E_INVALID_PARAM", "Scoped directory must be an absolute path.");
			const resolved = paths.resolve(args.path);
			if (!fsApi().existsSync(resolved)) throw new CommandError("E_NOT_FOUND", `Directory does not exist: ${resolved}`);
			if ((await showBlockingDialog({
				id: "bbmcp_scope",
				title: "Blockbench MCP — file access",
				message: `Allow MCP file access for this session?\n\n${resolved}\n\nOnly this folder becomes readable/writable by AI tools; nothing outside it is reachable.`,
				buttons: ["Allow this folder", "Deny"]
			}).result).index !== 0) throw new CommandError("E_SCOPE_DENIED", "User denied scoped directory access.");
			session.scopedDirectory = resolved;
			return {
				scoped_directory: resolved,
				confirmed: true
			};
		},
		save_project: (args) => {
			requireProject();
			const codec = Codecs?.project;
			const id = "project";
			if (!codec?.compile) throw new CommandError("E_UNSUPPORTED_FORMAT", "The .bbmodel project codec is unavailable.");
			const data = serialize(codec.compile());
			return {
				ok: true,
				codec: id,
				...writeScopedFile(args.path, data, args.overwrite)
			};
		},
		export_model: (args) => {
			requireProject();
			const { codec, id } = codecFor(args?.codec);
			if (typeof codec.compile !== "function") throw new CommandError("E_UNSUPPORTED_FORMAT", `Codec "${id}" cannot compile.`);
			const data = serialize(codec.compile());
			const written = writeScopedFile(args.path, data, args.overwrite);
			return {
				ok: true,
				codec: id,
				format: Format?.id ?? null,
				...written
			};
		}
	};
	//#endregion
	//#region src/tools/geometry.ts
	function descendants(root) {
		const out = [];
		const visit = (node) => {
			out.push(node);
			for (const child of node.children ?? []) visit(child);
		};
		visit(root);
		return out;
	}
	const v3 = (value) => [
		value[0],
		value[1],
		value[2]
	];
	const v2 = (value) => [value[0], value[1]];
	const v4 = (value) => [
		value[0],
		value[1],
		value[2],
		value[3]
	];
	const DEFAULT_SKIN = "#8a8a8a";
	const geometryTools = {
		apply_geometry_batch: (args) => materialize(args ?? {}),
		update_elements: (args) => {
			requireProject();
			const label = "update_elements";
			const resolved = (args?.updates ?? []).map((update) => {
				const element = requireElement(update.ref);
				if (update.parent !== void 0 && !element.from) {
					let cursor = update.parent === "root" ? null : requireGroup(update.parent);
					let guard = 0;
					while (cursor && guard < 64) {
						if (cursor.uuid === element.uuid) throw new CommandError("E_INVALID_PARAM", `Reparenting ${element.name} would create a cycle.`);
						cursor = cursor.parent && cursor.parent !== "root" && typeof cursor.parent !== "string" ? cursor.parent : null;
						guard += 1;
					}
				}
				if (element.from && (update.from || update.to || update.inflate !== void 0)) throw new CommandError("E_INVALID_PARAM", `Group ${element.name} does not support from/to/inflate.`);
				return {
					update,
					element
				};
			});
			const elements = [...new Set(resolved.map((r) => r.element))];
			return withUndo({
				outliner: true,
				elements
			}, label, () => {
				for (const { update, element } of resolved) {
					if (update.name !== void 0) element.name = update.name;
					if (update.origin !== void 0) element.origin = [...update.origin];
					if (update.rotation !== void 0) element.rotation = [...update.rotation];
					if (update.visibility !== void 0) element.visibility = update.visibility;
					if (element.from) {
						const dimensioned = update.from !== void 0 || update.to !== void 0;
						if (update.from !== void 0) element.from = [...update.from];
						if (update.to !== void 0) element.to = [...update.to];
						if (update.inflate !== void 0) element.inflate = update.inflate;
						if (dimensioned && args?.uv_policy === "auto") {
							element.autouv = 1;
							element.mapAutoUV?.();
						}
					}
					if (update.parent !== void 0) element.addTo(parentOf(update.parent));
				}
				refreshCanvas(elements.map((e) => ({ uuid: e.uuid })));
				return {
					ok: true,
					undo_label: label,
					updated: elements.map((e) => e.uuid)
				};
			});
		},
		delete_elements: (args) => materialize({
			delete_refs: args.refs,
			undo_label: "delete_elements"
		}),
		transform_elements: (args) => {
			requireProject();
			const rotate = args?.rotate ?? [
				0,
				0,
				0
			];
			const scale = args?.scale ?? [
				1,
				1,
				1
			];
			const translate = args?.translate ?? [
				0,
				0,
				0
			];
			const pivot = args?.pivot ?? [
				0,
				0,
				0
			];
			if (scale.some((v) => v <= 0)) throw new CommandError("E_INVALID_PARAM", "Scale components must be positive; use mirror_elements to reflect.");
			const selected = [...new Set((args?.refs ?? []).map((ref) => requireElement(ref)))];
			const trees = selected.filter((element) => {
				let parent = element.parent;
				let guard = 0;
				while (parent && parent !== "root" && guard < 64) {
					if (selected.includes(parent)) return false;
					parent = typeof parent === "string" ? findElement(parent)?.parent : parent.parent;
					guard += 1;
				}
				return true;
			}).map((root) => ({
				root,
				nodes: descendants(root)
			}));
			const nodes = trees.flatMap((tree) => tree.nodes);
			const uniform = Math.abs(scale[0] - scale[1]) < 1e-8 && Math.abs(scale[0] - scale[2]) < 1e-8;
			const radial = (point) => {
				let [x, y, z] = [
					point[0] - pivot[0],
					point[1] - pivot[1],
					point[2] - pivot[2]
				];
				for (let axis = 0; axis < 3; axis += 1) {
					const deg = rotate[axis] ?? 0;
					if (!deg) continue;
					const r = deg * Math.PI / 180;
					const c = Math.cos(r);
					const s = Math.sin(r);
					if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
					else if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
					else [x, y] = [x * c - y * s, x * s + y * c];
				}
				return [
					x + pivot[0],
					y + pivot[1],
					z + pivot[2]
				];
			};
			return withUndo({
				outliner: true,
				elements: nodes
			}, "transform_elements", () => {
				for (const { root, nodes: treeNodes } of trees) {
					const anchor = [...root.origin];
					const scaledAnchor = anchor.map((v, i) => pivot[i] + (v - pivot[i]) * scale[i]);
					const nextAnchor = radial(scaledAnchor).map((v, i) => v + translate[i]);
					for (const node of treeNodes) {
						const move = (point) => point.map((v, i) => nextAnchor[i] + (v - anchor[i]) * scale[i]);
						node.origin = move(node.origin);
						if (node.from) {
							if (!uniform && node.rotation?.some((v) => Math.abs(v) > 1e-8)) throw new CommandError("E_INVALID_PARAM", "Non-uniform scaling of rotated geometry would introduce shear; use a uniform scale.");
							node.from = move(node.from);
							node.to = move(node.to);
							if (uniform) node.inflate = (node.inflate ?? 0) * scale[0];
							if (args?.uv_policy === "auto") {
								node.autouv = 1;
								node.mapAutoUV?.();
							}
						}
					}
					root.rotation = composeRotation(root.rotation ?? [
						0,
						0,
						0
					], rotate);
				}
				refreshCanvas(nodes.map((n) => ({ uuid: n.uuid })));
				return {
					ok: true,
					undo_label: "transform_elements",
					updated: nodes.map((n) => n.uuid)
				};
			});
		},
		mirror_elements: (args) => {
			requireProject();
			const axis = args?.axis ?? "x";
			const ai = axis === "x" ? 0 : axis === "y" ? 1 : 2;
			const pivot = args?.pivot ?? 0;
			const sources = args.refs.map((ref) => requireElement(ref));
			const boxUv = resolveUvMode() === "box";
			const texture = findTexture();
			const swap = (name) => {
				if (/right/i.test(name)) return name.replace(/right/gi, "left");
				if (/left/i.test(name)) return name.replace(/left/gi, "right");
				if (/_r\b/i.test(name)) return name.replace(/_r\b/i, "_l");
				if (/_l\b/i.test(name)) return name.replace(/_l\b/i, "_r");
				return `${name}_mirrored`;
			};
			return withUndo({ outliner: true }, "mirror_elements", (track) => {
				const created = [];
				for (const source of sources) {
					const name = args.rename === false ? `${source.name}_mirrored` : swap(source.name);
					const origin = [...source.origin];
					origin[ai] = pivot * 2 - origin[ai];
					const parent = !source.parent || source.parent === "root" || typeof source.parent === "string" ? "root" : source.parent;
					if (source.from) {
						const from = [...source.from];
						const to = [...source.to];
						from[ai] = pivot * 2 - from[ai];
						to[ai] = pivot * 2 - to[ai];
						const mirroredRotation = [...source.rotation].map((v, i) => i === ai ? v : -v);
						const cube = new Cube({
							name,
							from: v3(from.map((v, i) => Math.min(v, to[i]))),
							to: v3(from.map((v, i) => Math.max(v, to[i]))),
							origin: v3(origin),
							rotation: v3(mirroredRotation),
							inflate: source.inflate ?? 0,
							autouv: 1,
							box_uv: boxUv
						}).init().addTo(parent);
						cube.mapAutoUV?.();
						texture?.applyToCube(cube.uuid, true);
						const row = {
							uuid: cube.uuid,
							name: cube.name,
							type: "cube"
						};
						created.push(row);
						track.addElements([cube]);
					} else {
						const group = new Group({
							name,
							origin: v3(origin),
							rotation: [
								0,
								0,
								0
							]
						}).init().addTo(parent);
						group.createUniqueName?.();
						const row = {
							uuid: group.uuid,
							name: group.name,
							type: "group"
						};
						created.push(row);
						track.addElements([group]);
					}
				}
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: `mirror_elements ${axis}`,
					created
				};
			});
		},
		array_cubes: (args) => {
			requireProject();
			const sources = args.sources.map((ref) => requireCube(ref));
			const boxUv = resolveUvMode() === "box";
			return withUndo({ outliner: true }, "array_cubes", (track) => {
				const created = [];
				for (let index = 1; index <= args.count; index += 1) for (const source of sources) {
					const delta = args.offset.map((v) => v * index);
					const name = String(args.name_pattern ?? "{name}_{index}").replace("{name}", source.name).replace("{index}", String(index));
					const parent = args.parent ?? (!source.parent || source.parent === "root" || typeof source.parent === "string" ? "root" : source.parent);
					const cube = new Cube({
						name,
						from: source.from.map((v, i) => v + delta[i]),
						to: source.to.map((v, i) => v + delta[i]),
						origin: source.origin.map((v, i) => v + delta[i]),
						rotation: v3([...source.rotation]),
						inflate: source.inflate ?? 0,
						autouv: args.uv_policy === "auto" ? 1 : 0,
						box_uv: source.box_uv ?? boxUv,
						uv_offset: source.uv_offset ? v2([...source.uv_offset]) : void 0
					}).init().addTo(parent === "root" || typeof parent !== "string" ? parent : requireGroup(parent));
					if (args.uv_policy === "auto") cube.mapAutoUV?.();
					else for (const [faceName, face] of Object.entries(source.faces ?? {})) if (cube.faces?.[faceName] && face?.uv) cube.faces[faceName].uv = v4([...face.uv]);
					const row = {
						uuid: cube.uuid,
						name: cube.name,
						type: "cube"
					};
					created.push(row);
					track.addElements([cube]);
				}
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "array_cubes",
					created
				};
			});
		},
		radial_array_cubes: (args) => {
			requireProject();
			const sources = args.sources.map((ref) => requireCube(ref));
			const axis = args.axis === "x" ? 0 : args.axis === "z" ? 2 : 1;
			const total = args.angle ?? 360;
			const rotateAround = (point, degrees) => {
				const out = point.map((v, i) => v - args.pivot[i]);
				const a = (axis + 1) % 3;
				const b = (axis + 2) % 3;
				const r = degrees * Math.PI / 180;
				const av = out[a] * Math.cos(r) - out[b] * Math.sin(r);
				const bv = out[a] * Math.sin(r) + out[b] * Math.cos(r);
				out[a] = av;
				out[b] = bv;
				return out.map((v, i) => v + args.pivot[i]);
			};
			return withUndo({ outliner: true }, "radial_array_cubes", (track) => {
				const created = [];
				for (let index = 1; index < args.count; index += 1) {
					const degrees = total * index / args.count;
					for (const source of sources) {
						const parent = args.parent ?? (!source.parent || source.parent === "root" || typeof source.parent === "string" ? "root" : source.parent);
						const center = source.from.map((v, i) => (v + source.to[i]) / 2);
						const nextCenter = rotateAround(center, degrees);
						const half = source.from.map((v, i) => Math.abs(source.to[i] - v) / 2);
						const rotation = [...source.rotation];
						if (args.rotate_cubes !== false) rotation[axis] += degrees;
						const name = String(args.name_pattern ?? "{name}_{index}").replace("{name}", source.name).replace("{index}", String(index));
						const cube = new Cube({
							name,
							from: v3(nextCenter.map((v, i) => v - half[i])),
							to: v3(nextCenter.map((v, i) => v + half[i])),
							origin: v3(rotateAround(source.origin, degrees)),
							rotation: v3(rotation),
							inflate: source.inflate ?? 0,
							autouv: args.uv_policy === "auto" ? 1 : 0,
							box_uv: source.box_uv
						}).init().addTo(parent === "root" || typeof parent !== "string" ? parent : requireGroup(parent));
						if (args.uv_policy === "auto") cube.mapAutoUV?.();
						const row = {
							uuid: cube.uuid,
							name: cube.name,
							type: "cube"
						};
						created.push(row);
						track.addElements([cube]);
					}
				}
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "radial_array_cubes",
					created
				};
			});
		},
		duplicate_hierarchy: (args) => {
			requireProject();
			const sourceRoot = requireGroup(args.root);
			const suffix = args.name_suffix ?? "_copy";
			const delta = args.translate ?? [
				0,
				0,
				0
			];
			const target = parentOf(args.parent);
			const boxUv = resolveUvMode() === "box";
			return withUndo({ outliner: true }, "duplicate_hierarchy", (track) => {
				const created = [];
				const copyGroup = (source, parent) => {
					const group = new Group({
						name: `${source.name}${suffix}`,
						origin: source.origin.map((v, i) => v + delta[i]),
						rotation: v3([...source.rotation])
					}).init().addTo(parent);
					created.push({
						uuid: group.uuid,
						name: group.name,
						type: "group"
					});
					track.addElements([group]);
					for (const child of source.children ?? []) if (child.children) copyGroup(child, group);
					else {
						const cube = new Cube({
							name: `${child.name}${suffix}`,
							from: child.from.map((v, i) => v + delta[i]),
							to: child.to.map((v, i) => v + delta[i]),
							origin: child.origin.map((v, i) => v + delta[i]),
							rotation: v3([...child.rotation]),
							inflate: child.inflate ?? 0,
							autouv: 1,
							box_uv: child.box_uv ?? boxUv
						}).init().addTo(group);
						if (args?.uv_policy === "auto") cube.mapAutoUV?.();
						else for (const [faceName, face] of Object.entries(child.faces ?? {})) if (cube.faces?.[faceName] && face?.uv) cube.faces[faceName].uv = v4(face.uv);
						created.push({
							uuid: cube.uuid,
							name: cube.name,
							type: "cube"
						});
						track.addElements([cube]);
					}
				};
				copyGroup(sourceRoot, target);
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "duplicate_hierarchy",
					created
				};
			});
		},
		create_limb: (args) => {
			requireProject();
			const texture = findTexture();
			const boxUv = resolveUvMode() === "box";
			const make = (name, pivot, size, from) => {
				const box = from ? {
					from,
					to: [
						from[0] + size[0],
						from[1] + size[1],
						from[2] + size[2]
					]
				} : {
					from: [
						pivot[0] - size[0] / 2,
						pivot[1] - size[1],
						pivot[2] - size[2] / 2
					],
					to: [
						pivot[0] + size[0] / 2,
						pivot[1],
						pivot[2] + size[2] / 2
					]
				};
				const group = new Group({
					name,
					origin: v3([...pivot]),
					rotation: [
						0,
						0,
						0
					]
				}).init().addTo(parentOf(args.parent));
				group.createUniqueName?.();
				const cube = new Cube({
					name: `${group.name}_cube`,
					from: v3(box.from),
					to: v3(box.to),
					origin: v3([...pivot]),
					autouv: 1,
					box_uv: boxUv
				}).init().addTo(group);
				cube.mapAutoUV?.();
				texture?.applyToCube(cube.uuid, true);
				return {
					group,
					cube
				};
			};
			return withUndo({ outliner: true }, `create_limb ${args.name}`, (track) => {
				const created = [];
				const primary = make(args.name, args.pivot, args.size, args.from);
				created.push({
					uuid: primary.group.uuid,
					name: primary.group.name,
					type: "group"
				}, {
					uuid: primary.cube.uuid,
					name: primary.cube.name,
					type: "cube"
				});
				if (args.mirror === "x") {
					const mirroredName = sideSuffix(args.name.replace(/right|left/gi, (m) => m.toLowerCase() === "right" ? "left" : "right"), void 0);
					const secondary = make(mirroredName === args.name ? `${args.name}_mirrored` : mirroredName, [
						-args.pivot[0],
						args.pivot[1],
						args.pivot[2]
					], args.size, args.from ? [
						-args.from[0] - args.size[0],
						args.from[1],
						args.from[2]
					] : void 0);
					created.push({
						uuid: secondary.group.uuid,
						name: secondary.group.name,
						type: "group"
					}, {
						uuid: secondary.cube.uuid,
						name: secondary.cube.name,
						type: "cube"
					});
				}
				for (const row of created) {
					const element = row.type === "group" ? findElement(row.uuid) : findCube(row.uuid);
					if (element) track.addElements([element]);
				}
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: `create_limb ${args.name}`,
					created
				};
			});
		},
		scaffold_biped: (args) => {
			requireProject();
			const scale = args?.scale ?? 1;
			const prefix = args?.name_prefix ?? "";
			const texSize = args?.texture_size ?? 64;
			const uvMode = resolveUvMode();
			const label = `scaffold_biped x${scale} uv=${uvMode}`;
			return withUndo({
				outliner: true,
				textures: [],
				bitmap: true
			}, label, (track) => {
				const skin = createTexture({
					name: `${prefix || ""}skin`,
					width: texSize,
					height: texSize,
					fill: DEFAULT_SKIN
				});
				track.addTextures([skin.raw]);
				skin.edit((ctx, canvas) => {
					ctx.fillStyle = "#6e6e6e";
					ctx.fillRect(0, Math.floor(canvas.height / 2), canvas.width, Math.ceil(canvas.height / 2));
					ctx.fillStyle = "#9a9a9a";
					ctx.fillRect(0, 0, canvas.width, Math.floor(canvas.height / 2));
				}, "scaffold base shade");
				const created = [];
				const add = (element, type) => {
					created.push({
						uuid: element.uuid,
						name: element.name,
						type
					});
					track.addElements([element]);
				};
				const bone = (name, origin, parent) => {
					const group = new Group({
						name,
						origin: v3(origin),
						rotation: [
							0,
							0,
							0
						]
					}).init().addTo(parent);
					group.createUniqueName?.();
					return group;
				};
				const cubeOn = (name, parent, from, size, origin, inflate = 0) => {
					const cube = new Cube({
						name,
						from: v3(from),
						to: [
							from[0] + size[0],
							from[1] + size[1],
							from[2] + size[2]
						],
						origin: v3(origin),
						inflate,
						autouv: 1,
						box_uv: uvMode === "box"
					}).init().addTo(parent);
					cube.mapAutoUV?.();
					skin.applyToCube(cube.uuid, true);
					return cube;
				};
				const root = bone(`${prefix}root`, [
					0,
					0,
					0
				], "root");
				add(root, "group");
				const body = bone(`${prefix}body`, [
					0,
					24 * scale,
					0
				], root);
				add(body, "group");
				add(cubeOn(`${prefix}body_cube`, body, [
					-4 * scale,
					12 * scale,
					-2 * scale
				], [
					8 * scale,
					12 * scale,
					4 * scale
				], [
					0,
					24 * scale,
					0
				]), "cube");
				const head = bone(`${prefix}head`, [
					0,
					24 * scale,
					0
				], body);
				add(head, "group");
				add(cubeOn(`${prefix}head_cube`, head, [
					-4 * scale,
					24 * scale,
					-4 * scale
				], [
					8 * scale,
					8 * scale,
					8 * scale
				], [
					0,
					24 * scale,
					0
				]), "cube");
				for (const side of ["right", "left"]) {
					const sign = side === "right" ? 1 : -1;
					const arm = bone(`${prefix}arm_${side}`, [
						sign * 6 * scale,
						22 * scale,
						0
					], body);
					add(arm, "group");
					add(cubeOn(`${prefix}arm_${side}_cube`, arm, [
						sign * 6 * scale - 2 * scale,
						12 * scale,
						-2 * scale
					], [
						4 * scale,
						12 * scale,
						4 * scale
					], [
						sign * 6 * scale,
						22 * scale,
						0
					]), "cube");
					const leg = bone(`${prefix}leg_${side}`, [
						sign * 2 * scale,
						12 * scale,
						0
					], body);
					add(leg, "group");
					add(cubeOn(`${prefix}leg_${side}_cube`, leg, [
						sign * 2 * scale - 2 * scale,
						0,
						-2 * scale
					], [
						4 * scale,
						12 * scale,
						4 * scale
					], [
						sign * 2 * scale,
						12 * scale,
						0
					]), "cube");
				}
				if (args?.include_outer_layers) add(cubeOn(`${prefix}hat`, head, [
					-4.5 * scale,
					23.5 * scale,
					-4.5 * scale
				], [
					9 * scale,
					9 * scale,
					9 * scale
				], [
					0,
					24 * scale,
					0
				], .25 * scale), "cube");
				const cubes = (Cube?.all ?? []).filter((c) => !prefix || c.name.startsWith(prefix));
				const plan = planUvPack(cubes.map((cube) => ({
					uuid: cube.uuid,
					name: cube.name,
					from: cube.from,
					to: cube.to
				})), {
					mode: uvMode,
					texW: texSize,
					padding: 1
				});
				if (plan.mode === "box") for (const item of plan.items) {
					const cube = cubes.find((c) => c.uuid === item.uuid);
					if (!cube) continue;
					cube.box_uv = true;
					cube.uv_offset = item.uv_offset;
					cube.autouv = 0;
					cube.mapAutoUV?.();
				}
				else for (const item of plan.items) {
					const cube = cubes.find((c) => c.uuid === item.uuid);
					if (!cube) continue;
					cube.box_uv = false;
					cube.autouv = 0;
					for (const face of item.faces) if (cube.faces?.[face.face]) cube.faces[face.face].uv = face.uv;
				}
				refreshCanvas(created.map((c) => ({ uuid: c.uuid })));
				const check = checkModel(snapshotElements(), {
					textureWidth: Project?.texture_width ?? 16,
					textureHeight: Project?.texture_height ?? 16,
					uvIslands: uvIslands()
				});
				return {
					ok: true,
					undo_label: label,
					uv_mode: uvMode,
					created,
					check: {
						summary: check.summary,
						findings: check.findings
					}
				};
			});
		},
		measure_model: (args) => {
			requireProject();
			const measured = measureModel(snapshotElements(), args?.refs);
			const size = measured.bounds.size;
			return {
				...measured,
				ratios: {
					width_to_height: size[1] ? Number((size[0] / size[1]).toFixed(3)) : null,
					depth_to_height: size[1] ? Number((size[2] / size[1]).toFixed(3)) : null,
					head_height_fraction: (() => {
						const head = measured.elements.find((row) => /head/i.test(String(row.name)));
						return head && size[1] ? Number((head.size[1] / size[1]).toFixed(3)) : null;
					})()
				},
				note: "Bounds include cube and parent rotations. Use compare_reference for silhouette matching."
			};
		},
		audit_symmetry: (args) => {
			requireProject();
			const axis = args?.axis ?? "x";
			const pivot = args?.pivot ?? 0;
			const tolerance = args?.tolerance ?? .001;
			const snapshot = snapshotElements();
			const side = (element) => ({
				name: element.name,
				min: element.from ?? element.origin,
				max: element.to ?? element.origin,
				origin: element.origin
			});
			return auditSymmetry(args.pairs.map((pair) => {
				const left = snapshot.find((e) => e.name === pair.left || e.uuid === pair.left);
				const right = snapshot.find((e) => e.name === pair.right || e.uuid === pair.right);
				if (!left || !right) throw new CommandError("E_NOT_FOUND", `Symmetry pair missing: ${pair.left}/${pair.right}`);
				return {
					left: side(left),
					right: side(right)
				};
			}), {
				axis,
				pivot,
				tolerance
			});
		}
	};
	//#endregion
	//#region src/tools/generators.ts
	function land(result, opts) {
		requireProject();
		if (opts.parent && !findGroup(opts.parent)) throw new CommandError("E_NOT_FOUND", `Parent group not found: ${opts.parent}`);
		const created = materialize({
			generated_groups: result.groups.map((g) => ({
				name: g.name,
				origin: g.origin,
				rotation: g.rotation,
				parent: g.parent ?? opts.parent
			})),
			create_cubes: result.cubes.map((c) => ({
				name: c.name,
				from: c.from,
				to: c.to,
				origin: c.origin,
				rotation: c.rotation,
				inflate: c.inflate,
				parent: c.parent ?? opts.parent
			})),
			undo_label: opts.undoLabel
		});
		return {
			ok: true,
			generator: opts.name,
			created_elements: created.created.length,
			created: created.created,
			notes: result.notes,
			points: result.points ?? null,
			side_validated: Boolean(opts.side),
			...opts.extra ?? {}
		};
	}
	const generatorTools = {
		voxelize_matrix: (args) => {
			if (args.side) assertSide(args.side, args.origin?.[0] ?? 0, "voxelize_matrix origin");
			const result = voxelizeMatrix(args);
			return land(result, {
				name: "voxelize_matrix",
				parent: args.parent,
				side: args.side,
				undoLabel: "voxelize_matrix",
				extra: { cubes: result.cubes.length }
			});
		},
		add_hollow_volume: (args) => {
			if (args.side) assertSide(args.side, (args.bounds.from[0] + args.bounds.to[0]) / 2, "add_hollow_volume bounds");
			const result = hollowVolume({
				from: args.bounds.from,
				to: args.bounds.to,
				wall_thickness: args.wall_thickness,
				open_faces: args.open_faces,
				name: args.name,
				inflate: args.inflate,
				parent: args.parent
			});
			return land(result, {
				name: "add_hollow_volume",
				parent: args.parent,
				side: args.side,
				undoLabel: "add_hollow_volume",
				extra: { cavity: {
					min: result.points?.cavity_min,
					max: result.points?.cavity_max
				} }
			});
		},
		generate_array: (args) => {
			if (args.side) assertSide(args.side, args.start?.[0] ?? args.center?.[0] ?? 0, "generate_array start");
			const result = generateArray(args);
			return land(result, {
				name: "generate_array",
				parent: args.parent,
				side: args.side,
				undoLabel: "generate_array",
				extra: { elements: result.cubes.length }
			});
		},
		extrude_chain: (args) => {
			if (args.side) assertSide(args.side, args.base_origin[0], "extrude_chain base_origin");
			const result = extrudeChain(args);
			return land(result, {
				name: "extrude_chain",
				parent: args.parent,
				side: args.side,
				undoLabel: `extrude_chain ${args.name ?? "chain"}`,
				extra: {
					tip: result.points?.tip ?? null,
					bones: result.groups.length
				}
			});
		},
		add_wing: (args) => {
			assertSide(args.side, args.base_origin[0], "add_wing base_origin");
			const result = addWing(args);
			return land(result, {
				name: "add_wing",
				parent: args.parent,
				side: args.side,
				undoLabel: `add_wing ${args.side}`,
				extra: { joints: result.points ?? null }
			});
		}
	};
	//#endregion
	//#region src/tools/paint.ts
	function textureOrThrow(ref) {
		requireProject();
		const texture = findTexture(ref);
		if (!texture) throw new CommandError("E_NOT_FOUND", ref ? `Texture not found: ${ref}` : "No texture — call ensure_texture first.");
		return texture;
	}
	function faceSpaceOf(cubeRef, face) {
		const cube = requireCube(cubeRef);
		const faceObj = cube.faces?.[face];
		if (!faceObj) throw new CommandError("E_NOT_FOUND", `Face not found: ${cubeRef}.${face}`);
		return {
			cube,
			face,
			space: resolveFaceSpace(faceObj.uv, faceObj.rotation)
		};
	}
	function imageOf(texture) {
		return texture.read((ctx, canvas) => ctx.getImageData(0, 0, canvas.width, canvas.height));
	}
	function revisionOf(texture) {
		return texture.read((ctx, canvas) => revisionFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
	}
	function assertRevision(texture, expected) {
		if (!expected) return;
		const actual = revisionOf(texture);
		if (actual !== expected) throw new CommandError("E_PARTIAL_FORBIDDEN", "Texture changed since it was read; call get_texture_revision again and redo the edit.", {
			expected,
			actual
		});
	}
	function rgbaOf(color) {
		if (color === null) return [
			0,
			0,
			0,
			0
		];
		const parsed = parseColor(color);
		if (!parsed) throw new CommandError("E_INVALID_PARAM", `Invalid CSS color: ${color}`);
		return parsed;
	}
	function setPixel(image, x, y, rgba) {
		if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
		image.data.set(rgba, (y * image.width + x) * 4);
		return true;
	}
	function getPixel(image, x, y) {
		if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [
			0,
			0,
			0,
			0
		];
		const i = (y * image.width + x) * 4;
		return [
			image.data[i],
			image.data[i + 1],
			image.data[i + 2],
			image.data[i + 3]
		];
	}
	function paintFaceLocal(atlas, space, paint) {
		const local = document.createElement("canvas");
		local.width = space.width;
		local.height = space.height;
		const ctx = local.getContext("2d");
		if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, local.width, local.height);
		paint(ctx);
		const data = ctx.getImageData(0, 0, local.width, local.height).data;
		for (let y = 0; y < local.height; y += 1) for (let x = 0; x < local.width; x += 1) {
			const i = (y * local.width + x) * 4;
			if (data[i + 3] === 0) continue;
			const [ax, ay] = faceLocalToAtlas(space, x, y);
			setPixel(atlas, ax, ay, [
				data[i],
				data[i + 1],
				data[i + 2],
				data[i + 3]
			]);
		}
	}
	function blurRegion(ctx, x, y, w, h, amount) {
		if (w < 2 || h < 2 || amount <= 0) return;
		const src = ctx.getImageData(x, y, w, h);
		const out = ctx.createImageData(w, h);
		for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let n = 0;
			for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
				const sx = px + dx;
				const sy = py + dy;
				if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
				const i = (sy * w + sx) * 4;
				r += src.data[i];
				g += src.data[i + 1];
				b += src.data[i + 2];
				a += src.data[i + 3];
				n += 1;
			}
			const o = (py * w + px) * 4;
			out.data[o] = Math.round(src.data[o] * (1 - amount) + r / n * amount);
			out.data[o + 1] = Math.round(src.data[o + 1] * (1 - amount) + g / n * amount);
			out.data[o + 2] = Math.round(src.data[o + 2] * (1 - amount) + b / n * amount);
			out.data[o + 3] = Math.round(src.data[o + 3] * (1 - amount) + a / n * amount);
		}
		ctx.putImageData(out, x, y);
	}
	const paintTools = {
		auto_uv_cubes: (args) => {
			requireProject();
			const list = args?.cubes?.length ? args.cubes.map((ref) => requireCube(ref)) : [...Cube?.all ?? []];
			if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to UV.");
			const mode = resolveUvMode(args?.mode ?? "auto");
			return withUndo({
				elements: list,
				uv_only: true
			}, "auto_uv_cubes", () => {
				for (const cube of list) {
					cube.box_uv = mode === "box";
					cube.autouv = 1;
					cube.mapAutoUV?.();
				}
				refreshCanvas(list.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "auto_uv_cubes",
					mode,
					updated: list.map((c) => c.uuid)
				};
			});
		},
		pack_box_uv: (args) => {
			requireProject();
			const list = args?.cubes?.length ? args.cubes.map((ref) => requireCube(ref)) : [...Cube?.all ?? []];
			if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to pack UV.");
			const mode = resolveUvMode(args?.mode ?? "auto");
			const pad = args?.padding ?? 1;
			let texW = Project?.texture_width ?? 64;
			let texH = Project?.texture_height ?? 64;
			const texture = findTexture(args?.texture);
			const selected = new Set(list.map((c) => c.uuid));
			const islands = collectUvIslands((Cube?.all ?? []).map((cube) => ({
				uuid: cube.uuid,
				name: cube.name,
				from: cube.from,
				to: cube.to,
				faces: cube.faces ?? {}
			})), texW, texH);
			const fixed = args?.preserve_others === false ? [] : islands.filter((i) => !selected.has(i.cube_uuid));
			const startY = fixed.length ? Math.ceil(Math.max(...fixed.map((i) => i.bounds[3])) + pad) : 0;
			return withUndo({
				elements: list,
				textures: texture ? [texture.raw] : [],
				bitmap: Boolean(texture),
				uv_only: true
			}, "pack_box_uv", () => {
				const plan = planUvPack(list.map((cube) => ({
					uuid: cube.uuid,
					name: cube.name,
					from: cube.from,
					to: cube.to
				})), {
					mode,
					texW,
					padding: pad,
					startY
				});
				if (plan.mode === "box") for (const item of plan.items) {
					const cube = list.find((c) => c.uuid === item.uuid);
					if (!cube) continue;
					cube.box_uv = true;
					cube.uv_offset = item.uv_offset;
					cube.autouv = 0;
					cube.mapAutoUV?.();
				}
				else for (const item of plan.items) {
					const cube = list.find((c) => c.uuid === item.uuid);
					if (!cube) continue;
					cube.box_uv = false;
					cube.autouv = 0;
					for (const face of item.faces) if (cube.faces?.[face.face]) cube.faces[face.face].uv = face.uv;
				}
				const used = plan.used;
				if (args?.auto_resize === false && (used[0] > texW || used[1] > texH)) throw new CommandError("E_INVALID_PARAM", `Packed UV extent ${used[0]}x${used[1]} exceeds atlas ${texW}x${texH}; enable auto_resize.`);
				if (args?.auto_resize !== false) {
					let needW = Math.max(texW, used[0]);
					let needH = Math.max(texH, used[1]);
					if (args?.power_of_two !== false) {
						needW = nextPowerOfTwo(needW);
						needH = nextPowerOfTwo(needH);
					}
					const maxSize = args?.max_size ?? 1024;
					if (needW > maxSize || needH > maxSize) throw new CommandError("E_INVALID_PARAM", `Packed atlas needs ${needW}x${needH}, over max_size ${maxSize}.`);
					if (needW !== texW || needH !== texH) {
						texW = needW;
						texH = needH;
						if (Project) {
							Project.texture_width = texW;
							Project.texture_height = texH;
						}
						texture?.edit((ctx, canvas) => {
							if (canvas.width >= texW && canvas.height >= texH) return;
							const previous = document.createElement("canvas");
							previous.width = canvas.width;
							previous.height = canvas.height;
							previous.getContext("2d")?.drawImage(canvas, 0, 0);
							canvas.width = Math.max(canvas.width, texW);
							canvas.height = Math.max(canvas.height, texH);
							ctx.imageSmoothingEnabled = false;
							ctx.clearRect(0, 0, canvas.width, canvas.height);
							ctx.drawImage(previous, 0, 0);
						}, "pack_box_uv resize");
					}
				}
				for (const cube of list) texture?.applyToCube(cube.uuid, true);
				refreshCanvas(list.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "pack_box_uv",
					mode,
					packed: list.length,
					used,
					texture_size: [texW, texH]
				};
			});
		},
		get_uv_layout: (args) => {
			requireProject();
			const all = collectUvIslands((Cube?.all ?? []).map((cube) => ({
				uuid: cube.uuid,
				name: cube.name,
				from: cube.from,
				to: cube.to,
				faces: cube.faces ?? {}
			})), Project?.texture_width ?? 16, Project?.texture_height ?? 16);
			const wanted = args?.cubes?.length ? new Set(args.cubes) : null;
			const islands = wanted ? all.filter((i) => wanted.has(i.cube) || wanted.has(i.cube_uuid)) : all;
			const overlaps = args?.include_overlaps === false ? [] : findUvOverlaps(islands, args?.allowed_overlaps ?? []);
			const used = islands.length ? [
				Math.min(...islands.map((i) => i.bounds[0])),
				Math.min(...islands.map((i) => i.bounds[1])),
				Math.max(...islands.map((i) => i.bounds[2])),
				Math.max(...islands.map((i) => i.bounds[3]))
			] : [
				0,
				0,
				0,
				0
			];
			return {
				texture_size: [Project?.texture_width ?? 16, Project?.texture_height ?? 16],
				islands,
				overlaps,
				summary: {
					islands: islands.length,
					out_of_bounds: islands.filter((i) => i.out_of_bounds).length,
					overlaps: overlaps.length,
					unintended_overlaps: overlaps.filter((o) => !o.intentional).length,
					used
				}
			};
		},
		get_uv_map: async (args) => {
			requireProject();
			const texture = findTexture(args?.texture);
			const width = Project?.texture_width ?? texture?.width ?? 16;
			const height = Project?.texture_height ?? texture?.height ?? 16;
			const scale = Math.min(args?.max_edge ?? 512, 1024) / Math.max(width, height, 1);
			const out = document.createElement("canvas");
			out.width = Math.max(1, Math.round(width * scale));
			out.height = Math.max(1, Math.round(height * scale));
			const ctx = out.getContext("2d");
			if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
			ctx.imageSmoothingEnabled = false;
			ctx.fillStyle = "#20242b";
			ctx.fillRect(0, 0, out.width, out.height);
			if (texture) {
				const dataUrl = texture.toDataURL(Math.max(width, height));
				await new Promise((resolve) => {
					const image = new Image();
					image.onload = () => {
						ctx.drawImage(image, 0, 0, out.width, out.height);
						resolve();
					};
					image.onerror = () => resolve();
					image.src = dataUrl;
				});
			}
			const all = collectUvIslands((Cube?.all ?? []).map((cube) => ({
				uuid: cube.uuid,
				name: cube.name,
				from: cube.from,
				to: cube.to,
				faces: cube.faces ?? {}
			})), width, height);
			const wanted = args?.cubes?.length ? new Set(args.cubes) : null;
			const islands = wanted ? all.filter((i) => wanted.has(i.cube) || wanted.has(i.cube_uuid)) : all;
			ctx.lineWidth = Math.max(1, scale / 4);
			ctx.font = `${Math.max(8, Math.round(scale * 2))}px monospace`;
			islands.forEach((island, index) => {
				const hue = index * 137.508 % 360;
				ctx.strokeStyle = `hsl(${hue} 90% 65%)`;
				ctx.strokeRect(island.bounds[0] * scale, island.bounds[1] * scale, island.pixel_size[0] * scale, island.pixel_size[1] * scale);
				if (args?.labels !== false && scale >= 2) {
					ctx.fillStyle = `hsl(${hue} 90% 75%)`;
					ctx.fillText(`${island.cube}.${island.face}`, island.bounds[0] * scale + 2, island.bounds[1] * scale + 10);
				}
			});
			return {
				width: out.width,
				height: out.height,
				islands: islands.length,
				mime: "image/png",
				data_url: out.toDataURL("image/png")
			};
		},
		set_face_uv: (args) => {
			requireProject();
			const entries = args.entries.map((entry) => {
				const cube = requireCube(entry.cube);
				const face = cube.faces?.[entry.face];
				if (!face) throw new CommandError("E_INVALID_PARAM", `Face not found: ${entry.cube}.${entry.face}`);
				return {
					entry,
					cube,
					face
				};
			});
			const cubes = [...new Set(entries.map((e) => e.cube))];
			return withUndo({
				elements: cubes,
				uv_only: true
			}, "set_face_uv", () => {
				for (const { entry, cube, face } of entries) {
					cube.box_uv = false;
					face.uv = [...entry.uv];
					if (entry.rotation !== void 0) face.rotation = entry.rotation;
				}
				refreshCanvas(cubes.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "set_face_uv",
					updated: cubes.map((c) => c.uuid)
				};
			});
		},
		transform_uv_islands: (args) => {
			requireProject();
			const entries = args.faces.map((target) => {
				const cube = requireCube(target.cube);
				const face = cube.faces?.[target.face];
				if (!face?.uv) throw new CommandError("E_INVALID_PARAM", `Face has no UV: ${target.cube}.${target.face}`);
				return {
					cube,
					face
				};
			});
			const points = entries.flatMap(({ face }) => [[face.uv[0], face.uv[1]], [face.uv[2], face.uv[3]]]);
			const pivot = args?.pivot ?? [(Math.min(...points.map((p) => p[0])) + Math.max(...points.map((p) => p[0]))) / 2, (Math.min(...points.map((p) => p[1])) + Math.max(...points.map((p) => p[1]))) / 2];
			const translate = args?.translate ?? [0, 0];
			const scale = args?.scale ?? [1, 1];
			const turns = Number(args?.rotate ?? "0") / 90;
			const transform = (point) => {
				let x = (point[0] - pivot[0]) * scale[0];
				let y = (point[1] - pivot[1]) * scale[1];
				for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
				return [x + pivot[0] + translate[0], y + pivot[1] + translate[1]];
			};
			const next = entries.map(({ cube, face }) => ({
				cube,
				face,
				a: transform([face.uv[0], face.uv[1]]),
				b: transform([face.uv[2], face.uv[3]])
			}));
			const width = Project?.texture_width ?? 16;
			const height = Project?.texture_height ?? 16;
			if (args?.clamp_to_texture !== false && next.some(({ a, b }) => [a, b].some(([x, y]) => x < 0 || y < 0 || x > width || y > height))) throw new CommandError("E_INVALID_PARAM", `Transformed UV would leave ${width}x${height} bounds.`);
			const cubes = [...new Set(entries.map((e) => e.cube))];
			return withUndo({
				elements: cubes,
				uv_only: true
			}, "transform_uv_islands", () => {
				for (const { cube, face, a, b } of next) {
					cube.box_uv = false;
					face.uv = [
						a[0],
						a[1],
						b[0],
						b[1]
					];
					face.rotation = (((face.rotation ?? 0) + Number(args?.rotate ?? "0")) % 360 + 360) % 360;
				}
				refreshCanvas(cubes.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "transform_uv_islands",
					updated: cubes.map((c) => c.uuid)
				};
			});
		},
		resize_texture: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			const oldW = Project?.texture_width ?? texture.width;
			const oldH = Project?.texture_height ?? texture.height;
			const scaleX = args.width / oldW;
			const scaleY = args.height / oldH;
			return withUndo({
				textures: [texture.raw],
				bitmap: true,
				elements: [...Cube?.all ?? []],
				uv_only: true
			}, "resize_texture", (track) => {
				track.addTextures([texture.raw]);
				texture.edit((ctx, canvas) => {
					const previous = document.createElement("canvas");
					previous.width = canvas.width;
					previous.height = canvas.height;
					previous.getContext("2d")?.drawImage(canvas, 0, 0);
					canvas.width = Math.round(args.width);
					canvas.height = Math.round(args.height);
					ctx.imageSmoothingEnabled = false;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(previous, 0, 0, canvas.width, canvas.height);
				}, "resize_texture");
				if (args?.rescale_uvs !== false) for (const cube of Cube?.all ?? []) {
					if (Array.isArray(cube.uv_offset)) cube.uv_offset = [cube.uv_offset[0] * scaleX, cube.uv_offset[1] * scaleY];
					for (const face of Object.values(cube.faces ?? {})) {
						if (!Array.isArray(face?.uv)) continue;
						face.uv = [
							face.uv[0] * scaleX,
							face.uv[1] * scaleY,
							face.uv[2] * scaleX,
							face.uv[3] * scaleY
						];
					}
				}
				if (Project) {
					Project.texture_width = Math.round(args.width);
					Project.texture_height = Math.round(args.height);
				}
				refreshCanvas();
				return {
					ok: true,
					undo_label: "resize_texture",
					size: [Math.round(args.width), Math.round(args.height)],
					uv_scale: [scaleX, scaleY]
				};
			});
		},
		ensure_texture: (args) => {
			requireProject();
			const name = args?.name ?? "texture";
			const width = args?.width ?? 64;
			const height = args?.height ?? 64;
			const existing = findTexture(name);
			if (existing) return {
				ok: true,
				existing: true,
				uuid: existing.uuid,
				name: existing.name,
				size: [existing.width, existing.height]
			};
			return withUndo({
				textures: [],
				bitmap: true
			}, `ensure_texture ${name}`, (track) => {
				const texture = createTexture({
					name,
					width,
					height,
					fill: args?.fill ?? "#808080"
				});
				track.addTextures([texture.raw]);
				return {
					ok: true,
					existing: false,
					uuid: texture.uuid,
					name: texture.name,
					size: [width, height]
				};
			});
		},
		assign_texture: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			const cubes = args.cubes.map((ref) => requireCube(ref));
			return withUndo({
				elements: cubes,
				textures: [texture.raw],
				bitmap: true
			}, "assign_texture", () => {
				for (const cube of cubes) texture.applyToCube(cube.uuid, args?.faces ?? true);
				refreshCanvas(cubes.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "assign_texture",
					cubes: cubes.length,
					faces: args?.faces ?? "all"
				};
			});
		},
		get_texture: (args) => {
			const texture = textureOrThrow(args?.texture);
			const maxEdge = args?.max_edge ?? 256;
			return {
				name: texture.name,
				uuid: texture.uuid,
				width: texture.width,
				height: texture.height,
				max_edge: maxEdge,
				mime: "image/png",
				data_url: texture.toDataURL(maxEdge)
			};
		},
		get_texture_revision: (args) => {
			const texture = textureOrThrow(args?.texture);
			return {
				texture: texture.name,
				uuid: texture.uuid,
				width: texture.width,
				height: texture.height,
				revision: revisionOf(texture),
				usage: "Pass this as expected_revision to paint_face_grid / edit_texture_pixels / replace_texture_color / flood_fill_texture / transform_texture_region / copy_face_pixels so a stale plan cannot overwrite newer paint."
			};
		},
		shade_model_base: (args) => {
			requireProject();
			const list = args?.cubes?.length ? args.cubes.map((ref) => requireCube(ref)) : [...Cube?.all ?? []];
			if (!list.length) throw new CommandError("E_NOT_FOUND", "No cubes to shade.");
			const texture = textureOrThrow(args?.texture);
			const base = args?.base ?? "#9c9c9c";
			const noise = args?.noise ?? .06;
			const blur = args?.blur ?? .45;
			const topLight = args?.top_light ?? .12;
			const bottomDark = args?.bottom_dark ?? .22;
			const edgeDark = args?.edge_darken ?? 0;
			const crisp = args?.crisp === true;
			const random = makeRandom(args?.seed ?? 2654435769);
			const faceMul = {
				up: 1 + topLight,
				down: 1 - bottomDark,
				north: .95,
				south: 1,
				east: 1.06,
				west: .88
			};
			const scale = texture.width / (Project?.texture_width || texture.width || 64);
			return withUndo({
				elements: list,
				textures: [texture.raw],
				bitmap: true
			}, "shade_model_base", (track) => {
				track.addTextures([texture.raw]);
				const jobs = [];
				for (const cube of list) {
					const color = regionColorFor(cube.name, args?.regions, base);
					texture.applyToCube(cube.uuid, true);
					for (const faceName of Object.keys(cube.faces ?? {})) {
						const uv = cube.faces[faceName]?.uv;
						if (!Array.isArray(uv) || uv.length < 4) continue;
						const x0 = Math.min(uv[0], uv[2]) * scale;
						const y0 = Math.min(uv[1], uv[3]) * scale;
						const w = Math.max(1, Math.round(Math.abs(uv[2] - uv[0]) * scale));
						const h = Math.max(1, Math.round(Math.abs(uv[3] - uv[1]) * scale));
						jobs.push({
							x: Math.round(x0),
							y: Math.round(y0),
							w,
							h,
							color,
							mul: faceMul[faceName] ?? 1
						});
					}
				}
				texture.edit((ctx) => {
					ctx.imageSmoothingEnabled = false;
					for (const job of jobs) {
						if (crisp) ctx.fillStyle = shadeHex(job.color, job.mul);
						else {
							const gradient = ctx.createLinearGradient(0, job.y, 0, job.y + job.h);
							gradient.addColorStop(0, shadeHex(job.color, job.mul * 1.1));
							gradient.addColorStop(1, shadeHex(job.color, job.mul * .84));
							ctx.fillStyle = gradient;
						}
						ctx.fillRect(job.x, job.y, job.w, job.h);
						if (edgeDark > 0 && job.w > 2 && job.h > 2) {
							ctx.fillStyle = shadeHex(job.color, job.mul * (1 - edgeDark));
							ctx.fillRect(job.x, job.y, job.w, 1);
							ctx.fillRect(job.x, job.y + job.h - 1, job.w, 1);
							ctx.fillRect(job.x, job.y, 1, job.h);
							ctx.fillRect(job.x + job.w - 1, job.y, 1, job.h);
						}
					}
					if (noise > 0) for (const job of jobs) {
						const count = Math.max(1, Math.floor(job.w * job.h * .1));
						for (let i = 0; i < count; i += 1) {
							const px = job.x + Math.floor(random() * job.w);
							const py = job.y + Math.floor(random() * job.h);
							ctx.fillStyle = shadeHex(job.color, job.mul * (1 - noise + random() * noise * 2));
							ctx.fillRect(px, py, 1, 1);
						}
					}
					if (blur > 0 && !crisp) for (const job of jobs) blurRegion(ctx, job.x, job.y, job.w, job.h, blur);
				}, "shade_model_base");
				refreshCanvas(list.map((c) => ({ uuid: c.uuid })));
				return {
					ok: true,
					undo_label: "shade_model_base",
					textured: list.length,
					faces: jobs.length
				};
			});
		},
		paint_face_features: (args) => {
			requireProject();
			if (!args?.faces?.length) throw new CommandError("E_INVALID_PARAM", "faces[] required");
			const texture = textureOrThrow(args?.texture);
			const jobs = args.faces.map((item) => ({
				...faceSpaceOf(item.cube, item.face),
				ops: item.ops
			}));
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "paint_face_features", (track) => {
				track.addTextures([texture.raw]);
				for (const job of jobs) texture.applyToCube(job.cube.uuid, [job.face]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					for (const job of jobs) paintFaceLocal(image, job.space, (local) => {
						for (const op of job.ops) {
							local.fillStyle = op.color;
							local.strokeStyle = op.color;
							if (op.type === "fill") local.fillRect(0, 0, job.space.width, job.space.height);
							else if (op.type === "line") {
								local.lineWidth = Math.max(1, op.width ?? 1);
								local.beginPath();
								local.moveTo(op.x + .5, op.y + .5);
								local.lineTo((op.x2 ?? op.x) + .5, (op.y2 ?? op.y) + .5);
								local.stroke();
							} else if (op.type === "rect") local.fillRect(op.x, op.y, op.width, op.height);
							else {
								local.beginPath();
								local.ellipse(op.x + op.width / 2, op.y + op.height / 2, Math.max(.5, op.width / 2), Math.max(.5, op.height / 2), 0, 0, Math.PI * 2);
								local.fill();
							}
						}
					});
					ctx.putImageData(image, 0, 0);
				}, "paint_face_features");
				refreshCanvas(jobs.map((j) => ({ uuid: j.cube.uuid })));
				return {
					ok: true,
					undo_label: "paint_face_features",
					painted: jobs.length
				};
			});
		},
		paint_pixel_batch: (args) => {
			requireProject();
			if (!args?.strokes?.length) throw new CommandError("E_INVALID_PARAM", "strokes[] required");
			const texture = textureOrThrow(args?.texture);
			const jobs = args.strokes.map((stroke) => ({
				...faceSpaceOf(stroke.cube, stroke.face),
				stroke
			}));
			let stamps = 0;
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "paint_pixel_batch", (track) => {
				track.addTextures([texture.raw]);
				for (const job of jobs) texture.applyToCube(job.cube.uuid, [job.face]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					for (const job of jobs) {
						const size = job.stroke.size ?? 1;
						const shape = job.stroke.shape ?? "square";
						paintFaceLocal(image, job.space, (local) => {
							if (args?.clip_to_face !== false) {
								local.beginPath();
								local.rect(0, 0, job.space.width, job.space.height);
								local.clip();
							}
							local.fillStyle = job.stroke.color;
							const stamp = (x, y) => {
								const offset = Math.floor(size / 2);
								if (shape === "square") local.fillRect(x - offset, y - offset, size, size);
								else {
									const center = (size - 1) / 2;
									const radiusSquared = (size / 2) ** 2;
									for (let py = 0; py < size; py += 1) for (let px = 0; px < size; px += 1) {
										const dx = px - center;
										const dy = py - center;
										if (dx * dx + dy * dy <= radiusSquared) local.fillRect(x - offset + px, y - offset + py, 1, 1);
									}
								}
								stamps += 1;
							};
							const points = job.stroke.points;
							stamp(points[0].x, points[0].y);
							for (let i = 1; i < points.length; i += 1) {
								let x = points[i - 1].x;
								let y = points[i - 1].y;
								const target = points[i];
								const dx = Math.abs(target.x - x);
								const sx = x < target.x ? 1 : -1;
								const dy = -Math.abs(target.y - y);
								const sy = y < target.y ? 1 : -1;
								let error = dx + dy;
								for (;;) {
									if (x === target.x && y === target.y) break;
									const twice = error * 2;
									if (twice >= dy) {
										error += dy;
										x += sx;
									}
									if (twice <= dx) {
										error += dx;
										y += sy;
									}
									stamp(x, y);
								}
							}
						});
					}
					ctx.putImageData(image, 0, 0);
				}, "paint_pixel_batch");
				refreshCanvas(jobs.map((j) => ({ uuid: j.cube.uuid })));
				return {
					ok: true,
					undo_label: "paint_pixel_batch",
					strokes: jobs.length,
					stamps
				};
			});
		},
		paint_face_grid: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const { cube, face, space } = faceSpaceOf(args.cube, args.face);
			const grid = args.rows.map((row) => Array.from(row));
			if (grid.length !== space.height || grid.some((row) => row.length !== space.width)) throw new CommandError("E_INVALID_PARAM", `Grid must be exactly ${space.width}x${space.height} face-local texels (rows=${args.rows.length}, widths=${args.rows.map((r) => Array.from(r).length).join("/")}).`);
			const palette = new Map();
			for (const [symbol, color] of Object.entries(args.palette)) {
				if (Array.from(symbol).length !== 1) throw new CommandError("E_INVALID_PARAM", `Palette key must be exactly one symbol: "${symbol}"`);
				palette.set(symbol, rgbaOf(color));
			}
			let painted = 0;
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "paint_face_grid", (track) => {
				track.addTextures([texture.raw]);
				texture.applyToCube(cube.uuid, [face]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					for (let y = 0; y < space.height; y += 1) for (let x = 0; x < space.width; x += 1) {
						const symbol = grid[y][x];
						const color = palette.get(symbol);
						if (!color) throw new CommandError("E_INVALID_PARAM", `Unknown palette symbol: "${symbol}"`);
						const [ax, ay] = faceLocalToAtlas(space, x, y);
						if (!setPixel(image, ax, ay, color)) throw new CommandError("E_INVALID_PARAM", `Mapped pixel outside atlas: ${ax},${ay}`);
						painted += 1;
					}
					ctx.putImageData(image, 0, 0);
				}, "paint_face_grid");
				refreshCanvas([{ uuid: cube.uuid }]);
				return {
					ok: true,
					undo_label: "paint_face_grid",
					pixels: painted,
					revision: revisionOf(texture)
				};
			});
		},
		get_face_grid: (args) => {
			const texture = textureOrThrow(args?.texture);
			const { space } = faceSpaceOf(args.cube, args.face);
			const image = imageOf(texture);
			const rows = [];
			for (let y = 0; y < space.height; y += 1) {
				const row = [];
				for (let x = 0; x < space.width; x += 1) {
					const [ax, ay] = faceLocalToAtlas(space, x, y);
					row.push(toHex(getPixel(image, ax, ay)));
				}
				rows.push(row);
			}
			return {
				cube: args.cube,
				face: args.face,
				width: space.width,
				height: space.height,
				rows,
				revision: revisionFromPixels(image.data, image.width, image.height)
			};
		},
		edit_texture_pixels: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : void 0;
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "edit_texture_pixels", (track) => {
				track.addTextures([texture.raw]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					let changed = 0;
					for (const pixel of args.pixels) {
						const [x, y] = target ? faceLocalToAtlas(target.space, pixel.x, pixel.y) : [pixel.x, pixel.y];
						if (!setPixel(image, x, y, rgbaOf(pixel.color))) throw new CommandError("E_INVALID_PARAM", `Pixel outside target: ${pixel.x},${pixel.y}${target ? ` (face is ${target.space.width}x${target.space.height})` : ""}`);
						changed += 1;
					}
					ctx.putImageData(image, 0, 0);
					return changed;
				}, "edit_texture_pixels");
				if (target) refreshCanvas([{ uuid: target.cube.uuid }]);
				return {
					ok: true,
					undo_label: "edit_texture_pixels",
					changed: args.pixels.length,
					revision: revisionOf(texture)
				};
			});
		},
		replace_texture_color: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : void 0;
			const from = rgbaOf(args.from);
			const to = rgbaOf(args.to ?? null);
			const tolerance = args?.tolerance ?? 0;
			let replaced = 0;
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "replace_texture_color", (track) => {
				track.addTextures([texture.raw]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const visit = (x, y) => {
						if (!getPixel(image, x, y).every((v, i) => Math.abs(v - from[i]) <= tolerance)) return;
						setPixel(image, x, y, to);
						replaced += 1;
					};
					if (target) for (let y = 0; y < target.space.height; y += 1) for (let x = 0; x < target.space.width; x += 1) visit(...faceLocalToAtlas(target.space, x, y));
					else for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) visit(x, y);
					ctx.putImageData(image, 0, 0);
				}, "replace_texture_color");
				refreshCanvas();
				return {
					ok: true,
					undo_label: "replace_texture_color",
					replaced,
					revision: revisionOf(texture)
				};
			});
		},
		copy_face_pixels: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const source = faceSpaceOf(args.source.cube, args.source.face);
			const target = faceSpaceOf(args.target.cube, args.target.face);
			const rotation = Number(args?.rotation ?? "0");
			const turns = rotation === 90 || rotation === 270;
			const expectW = turns ? source.space.height : source.space.width;
			const expectH = turns ? source.space.width : source.space.height;
			if (target.space.width !== expectW || target.space.height !== expectH) throw new CommandError("E_INVALID_PARAM", `Target face must be ${expectW}x${expectH} after rotation (it is ${target.space.width}x${target.space.height}).`);
			const image = imageOf(texture);
			const colors = [];
			for (let y = 0; y < source.space.height; y += 1) {
				const row = [];
				for (let x = 0; x < source.space.width; x += 1) row.push(getPixel(image, ...faceLocalToAtlas(source.space, x, y)));
				colors.push(row);
			}
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "copy_face_pixels", (track) => {
				track.addTextures([texture.raw]);
				texture.applyToCube(target.cube.uuid, [target.face]);
				texture.edit((ctx, canvas) => {
					const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
					for (let sy = 0; sy < source.space.height; sy += 1) for (let sx = 0; sx < source.space.width; sx += 1) {
						const fx = args?.flip_x ? source.space.width - 1 - sx : sx;
						const fy = args?.flip_y ? source.space.height - 1 - sy : sy;
						let tx = fx;
						let ty = fy;
						if (rotation === 90) {
							tx = source.space.height - 1 - fy;
							ty = fx;
						} else if (rotation === 180) {
							tx = source.space.width - 1 - fx;
							ty = source.space.height - 1 - fy;
						} else if (rotation === 270) {
							tx = fy;
							ty = source.space.width - 1 - fx;
						}
						setPixel(out, ...faceLocalToAtlas(target.space, tx, ty), colors[sy][sx]);
					}
					ctx.putImageData(out, 0, 0);
				}, "copy_face_pixels");
				refreshCanvas([{ uuid: target.cube.uuid }]);
				return {
					ok: true,
					undo_label: "copy_face_pixels",
					pixels: source.space.width * source.space.height,
					revision: revisionOf(texture)
				};
			});
		},
		flood_fill_texture: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : void 0;
			const width = target?.space.width ?? texture.width;
			const height = target?.space.height ?? texture.height;
			if (args.x < 0 || args.y < 0 || args.x >= width || args.y >= height) throw new CommandError("E_INVALID_PARAM", `Seed (${args.x},${args.y}) outside ${width}x${height}.`);
			const fill = rgbaOf(args.color ?? null);
			const tolerance = args?.tolerance ?? 0;
			const cap = args?.max_pixels ?? 65536;
			let filled = 0;
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "flood_fill_texture", (track) => {
				track.addTextures([texture.raw]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const atlas = (x, y) => target ? faceLocalToAtlas(target.space, x, y) : [x, y];
					const start = getPixel(image, ...atlas(args.x, args.y));
					if (start.every((v, i) => Math.abs(v - fill[i]) <= 0)) return;
					const queue = [[args.x, args.y]];
					const seen = new Uint8Array(width * height);
					const neighbours = args?.diagonal ? [
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1],
						[1, 1],
						[-1, 1],
						[1, -1],
						[-1, -1]
					] : [
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1]
					];
					for (let head = 0; head < queue.length; head += 1) {
						const [x, y] = queue[head];
						if (x < 0 || y < 0 || x >= width || y >= height) continue;
						const key = y * width + x;
						if (seen[key]) continue;
						seen[key] = 1;
						const point = atlas(x, y);
						if (!getPixel(image, ...point).every((v, i) => Math.abs(v - start[i]) <= tolerance)) continue;
						setPixel(image, ...point, fill);
						filled += 1;
						if (filled > cap) throw new CommandError("E_INVALID_PARAM", `Flood fill exceeds max_pixels ${cap}.`);
						for (const [dx, dy] of neighbours) queue.push([x + dx, y + dy]);
					}
					ctx.putImageData(image, 0, 0);
				}, "flood_fill_texture");
				refreshCanvas();
				return {
					ok: true,
					undo_label: "flood_fill_texture",
					filled,
					revision: revisionOf(texture)
				};
			});
		},
		transform_texture_region: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			assertRevision(texture, args?.expected_revision);
			const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : void 0;
			const [rx, ry, w, h] = args?.rect ?? [
				0,
				0,
				target?.space.width ?? texture.width,
				target?.space.height ?? texture.height
			];
			if (target && (rx !== 0 || ry !== 0)) throw new CommandError("E_INVALID_PARAM", "Face transforms use the full face (omit rect).");
			if ((args.operation === "rotate_90" || args.operation === "rotate_270") && w !== h) throw new CommandError("E_INVALID_PARAM", "Quarter-turn region must be square.");
			return withUndo({
				textures: [texture.raw],
				bitmap: true
			}, "transform_texture_region", (track) => {
				track.addTextures([texture.raw]);
				texture.edit((ctx, canvas) => {
					const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
					if (!target && (rx + w > canvas.width || ry + h > canvas.height)) throw new CommandError("E_INVALID_PARAM", "Region exceeds texture bounds.");
					const atlas = (x, y) => target ? faceLocalToAtlas(target.space, x, y) : [rx + x, ry + y];
					const source = [];
					for (let y = 0; y < h; y += 1) {
						const row = [];
						for (let x = 0; x < w; x += 1) row.push(getPixel(image, ...atlas(x, y)));
						source.push(row);
					}
					for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
						let sx = x;
						let sy = y;
						if (args.operation === "flip_x") sx = w - 1 - x;
						else if (args.operation === "flip_y") sy = h - 1 - y;
						else if (args.operation === "rotate_180") {
							sx = w - 1 - x;
							sy = h - 1 - y;
						} else if (args.operation === "rotate_90") {
							sx = y;
							sy = h - 1 - x;
						} else {
							sx = w - 1 - y;
							sy = x;
						}
						setPixel(image, ...atlas(x, y), source[sy][sx]);
					}
					ctx.putImageData(image, 0, 0);
				}, "transform_texture_region");
				refreshCanvas();
				return {
					ok: true,
					undo_label: "transform_texture_region",
					pixels: w * h,
					revision: revisionOf(texture)
				};
			});
		},
		analyze_texture_palette: (args) => {
			requireProject();
			const image = imageOf(textureOrThrow(args?.texture));
			const counts = new Map();
			let total = 0;
			let transparent = 0;
			const visit = (x, y) => {
				const pixel = getPixel(image, x, y);
				const key = toHex(pixel);
				counts.set(key, (counts.get(key) ?? 0) + 1);
				total += 1;
				if (pixel[3] === 0) transparent += 1;
			};
			if (args?.face) {
				const { space } = faceSpaceOf(args.face.cube, args.face.face);
				for (let y = 0; y < space.height; y += 1) for (let x = 0; x < space.width; x += 1) visit(...faceLocalToAtlas(space, x, y));
			} else for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) visit(x, y);
			return {
				total_pixels: total,
				unique_colors: counts.size,
				transparent_pixels: transparent,
				colors: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, args?.max_colors ?? 32).map(([color, count]) => ({
					color,
					count,
					percent: total ? count / total : 0
				}))
			};
		},
		get_texture_region: (args) => {
			requireProject();
			const image = imageOf(textureOrThrow(args?.texture));
			const target = args?.face ? faceSpaceOf(args.face.cube, args.face.face) : void 0;
			const rect = args?.rect ?? [
				0,
				0,
				image.width,
				image.height
			];
			const [rx, ry, w, h] = rect;
			if (rx + w > image.width || ry + h > image.height) throw new CommandError("E_INVALID_PARAM", "Region exceeds texture bounds.");
			const scale = args?.scale ?? 8;
			const outW = target ? target.space.width : w;
			const outH = target ? target.space.height : h;
			const out = document.createElement("canvas");
			out.width = outW * scale;
			out.height = outH * scale;
			const ctx = out.getContext("2d");
			if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context");
			if (args?.checkerboard !== false) for (let py = 0; py < outH; py += 1) for (let px = 0; px < outW; px += 1) {
				ctx.fillStyle = (px + py) % 2 ? "#9aa0a6" : "#d5d8dc";
				ctx.fillRect(px * scale, py * scale, scale, scale);
			}
			ctx.imageSmoothingEnabled = false;
			if (target) for (let py = 0; py < target.space.height; py += 1) for (let px = 0; px < target.space.width; px += 1) {
				const [ax, ay] = faceLocalToAtlas(target.space, px, py);
				const pixel = getPixel(image, ax, ay);
				ctx.fillStyle = toHex(pixel);
				ctx.globalAlpha = pixel[3] / 255;
				ctx.fillRect(px * scale, py * scale, scale, scale);
				ctx.globalAlpha = 1;
			}
			else for (let py = 0; py < h; py += 1) for (let px = 0; px < w; px += 1) {
				const pixel = getPixel(image, rx + px, ry + py);
				ctx.fillStyle = toHex(pixel);
				ctx.globalAlpha = pixel[3] / 255;
				ctx.fillRect(px * scale, py * scale, scale, scale);
				ctx.globalAlpha = 1;
			}
			if (args?.grid !== false && scale >= 4) {
				ctx.strokeStyle = "rgba(0,0,0,.35)";
				ctx.lineWidth = 1;
				for (let px = 0; px <= outW; px += 1) {
					ctx.beginPath();
					ctx.moveTo(px * scale + .5, 0);
					ctx.lineTo(px * scale + .5, out.height);
					ctx.stroke();
				}
				for (let py = 0; py <= outH; py += 1) {
					ctx.beginPath();
					ctx.moveTo(0, py * scale + .5);
					ctx.lineTo(out.width, py * scale + .5);
					ctx.stroke();
				}
			}
			return {
				width: out.width,
				height: out.height,
				source: rect,
				mime: "image/png",
				data_url: out.toDataURL("image/png")
			};
		},
		audit_texture_quality: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			const image = imageOf(texture);
			const refs = args?.faces ?? (Cube?.all ?? []).flatMap((cube) => FACE_NAMES.filter((face) => cube.faces?.[face]).map((face) => ({
				cube: cube.uuid,
				face
			})));
			const findings = [];
			for (const ref of refs) {
				const { cube, space } = faceSpaceOf(ref.cube, ref.face);
				const grid = [];
				for (let y = 0; y < space.height; y += 1) {
					const row = [];
					for (let x = 0; x < space.width; x += 1) row.push(getPixel(image, ...faceLocalToAtlas(space, x, y)));
					grid.push(row);
				}
				for (const finding of auditFacePixels(grid, {
					paletteLimit: args?.palette_limit,
					minBaseRatio: args?.min_base_ratio,
					glass: args?.glass
				})) findings.push({
					...finding,
					face: `${cube.name}.${ref.face}`
				});
			}
			return {
				texture: texture.name,
				revision: revisionOf(texture),
				faces: refs.length,
				findings,
				summary: {
					errors: findings.filter((f) => f.severity === "error").length,
					warns: findings.filter((f) => f.severity === "warn").length,
					infos: findings.filter((f) => f.severity === "info").length
				}
			};
		},
		import_texture_png: async (args) => {
			requireProject();
			const bytes = readScopedFile(args.path);
			let binary = "";
			for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 32768)));
			const dataUrl = `data:image/png;base64,${btoa(binary)}`;
			const image = await new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = () => reject(new CommandError("E_INVALID_PARAM", "PNG decode failed."));
				img.src = dataUrl;
			});
			const existing = args?.texture ? textureOrThrow(args.texture) : void 0;
			if (existing) assertRevision(existing, args?.expected_revision);
			return withUndo({
				textures: existing ? [existing.raw] : [],
				bitmap: true
			}, "import_texture_png", (track) => {
				const target = existing ?? createTexture({
					name: args?.name ?? "imported_texture",
					width: image.naturalWidth,
					height: image.naturalHeight,
					fill: "rgba(0,0,0,0)"
				});
				track.addTextures([target.raw]);
				target.edit((ctx, canvas) => {
					canvas.width = image.naturalWidth;
					canvas.height = image.naturalHeight;
					ctx.imageSmoothingEnabled = false;
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.drawImage(image, 0, 0);
				}, "import_texture_png");
				if (args?.resize_project !== false && Project) {
					Project.texture_width = image.naturalWidth;
					Project.texture_height = image.naturalHeight;
				}
				refreshCanvas();
				return {
					ok: true,
					undo_label: "import_texture_png",
					name: target.name,
					uuid: target.uuid,
					size: [image.naturalWidth, image.naturalHeight],
					bytes: bytes.byteLength,
					revision: revisionOf(target)
				};
			});
		},
		export_texture_png: (args) => {
			requireProject();
			const texture = textureOrThrow(args?.texture);
			const encoded = texture.toDataURL(Math.max(texture.width, texture.height)).split(",", 2)[1] ?? "";
			const binary = atob(encoded);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			const written = writeScopedFile(args.path, bytes, args.overwrite);
			return {
				ok: true,
				name: texture.name,
				size: [texture.width, texture.height],
				...written
			};
		},
		ensure_material_set: (args) => {
			requireProject();
			const defaults = {
				base: "#808080ff",
				emissive: "#000000ff",
				normal: "#8080ffff",
				specular: "#000000ff"
			};
			return withUndo({
				textures: [],
				bitmap: true
			}, "ensure_material_set", (track) => {
				return {
					ok: true,
					undo_label: "ensure_material_set",
					textures: [...new Set(args.channels)].map((channel) => {
						const texture = createTexture({
							name: `${args.prefix}_${channel}`,
							width: args.width,
							height: args.height,
							fill: args?.fills?.[channel] ?? defaults[channel] ?? "#808080ff"
						});
						track.addTextures([texture.raw]);
						return {
							channel,
							uuid: texture.uuid,
							name: texture.name,
							size: [texture.width, texture.height]
						};
					}),
					note: "Not every Blockbench format exports the same material semantics; this only guarantees consistent sheets."
				};
			});
		},
		audit_material_set: (args) => {
			requireProject();
			const entries = Object.entries(args.channels).map(([channel, ref]) => {
				const texture = findTexture(ref);
				if (!texture) throw new CommandError("E_NOT_FOUND", `Texture not found: ${ref}`);
				return {
					channel,
					texture
				};
			});
			const base = entries.find((e) => e.channel === "base")?.texture;
			const findings = [];
			const isPowerOfTwo = (v) => (v & v - 1) === 0;
			for (const { channel, texture } of entries) {
				if (base && (texture.width !== base.width || texture.height !== base.height)) findings.push({
					severity: "error",
					code: "MATERIAL_SIZE_MISMATCH",
					message: `${channel} ${texture.name} is ${texture.width}x${texture.height}; base is ${base.width}x${base.height}`
				});
				if (args?.require_power_of_two !== false && (!isPowerOfTwo(texture.width) || !isPowerOfTwo(texture.height))) findings.push({
					severity: "warn",
					code: "MATERIAL_NOT_POWER_OF_TWO",
					message: `${channel} ${texture.name} is not power-of-two`
				});
				if (args?.naming_prefix && !texture.name.startsWith(args.naming_prefix)) findings.push({
					severity: "warn",
					code: "MATERIAL_NAME_MISMATCH",
					message: `${channel} ${texture.name} does not start with ${args.naming_prefix}`
				});
			}
			return {
				channels: Object.fromEntries(entries.map(({ channel, texture }) => [channel, {
					uuid: texture.uuid,
					name: texture.name,
					width: texture.width,
					height: texture.height
				}])),
				findings,
				summary: {
					channels: entries.length,
					errors: findings.filter((f) => f.severity === "error").length,
					warns: findings.filter((f) => f.severity === "warn").length
				}
			};
		}
	};
	//#endregion
	//#region src/tools/animation.ts
	function buildCycle(type, bones, length, amplitude) {
		const a = amplitude;
		const bonesOf = (name) => bones[name];
		const notes = [];
		const put = (cycle, bone, channel, keys) => {
			if (!bone) return;
			cycle[bone] = cycle[bone] ?? {};
			cycle[bone][channel] = [...cycle[bone][channel] ?? [], ...keys];
		};
		const k = (time, value, interpolation = "catmullrom") => ({
			time: Number(time.toFixed(4)),
			value,
			interpolation
		});
		const cycle = {};
		const body = bonesOf("body");
		const head = bonesOf("head");
		const armL = bonesOf("arm_left");
		const armR = bonesOf("arm_right");
		const legL = bonesOf("leg_left");
		const legR = bonesOf("leg_right");
		const tail = bonesOf("tail");
		const wingL = bonesOf("wing_left");
		const wingR = bonesOf("wing_right");
		const bob = (amount, times = [
			0,
			.5,
			1
		]) => times.map((t) => k(t * length, [
			0,
			t === .5 ? amount : 0,
			0
		]));
		switch (type) {
			case "idle":
				put(cycle, body, "position", bob(.35 * a));
				put(cycle, head, "rotation", [
					k(0, [
						2 * a,
						-3 * a,
						0
					]),
					k(.5 * length, [
						0,
						3 * a,
						0
					]),
					k(length, [
						2 * a,
						-3 * a,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						2 * a,
						0,
						0
					]),
					k(.5 * length, [
						-2 * a,
						0,
						0
					]),
					k(length, [
						2 * a,
						0,
						0
					])
				]);
				put(cycle, armR, "rotation", [
					k(0, [
						-2 * a,
						0,
						0
					]),
					k(.5 * length, [
						2 * a,
						0,
						0
					]),
					k(length, [
						-2 * a,
						0,
						0
					])
				]);
				put(cycle, tail, "rotation", [
					k(0, [
						0,
						6 * a,
						0
					]),
					k(.5 * length, [
						0,
						-6 * a,
						0
					]),
					k(length, [
						0,
						6 * a,
						0
					])
				]);
				notes.push("Idle is a small body bob + head sway; keep it subtle so it never looks twitchy.");
				return {
					cycle,
					loop: "loop",
					notes
				};
			case "walk":
			case "run": {
				const stride = (type === "run" ? 38 : 26) * a;
				const lean = type === "run" ? -12 * a : -4 * a;
				const armSwing = (type === "run" ? 34 : 22) * a;
				put(cycle, legL, "rotation", [
					k(0, [
						stride,
						0,
						0
					]),
					k(.5 * length, [
						-stride,
						0,
						0
					]),
					k(length, [
						stride,
						0,
						0
					])
				]);
				put(cycle, legR, "rotation", [
					k(0, [
						-stride,
						0,
						0
					]),
					k(.5 * length, [
						stride,
						0,
						0
					]),
					k(length, [
						-stride,
						0,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						-armSwing,
						0,
						0
					]),
					k(.5 * length, [
						armSwing,
						0,
						0
					]),
					k(length, [
						-armSwing,
						0,
						0
					])
				]);
				put(cycle, armR, "rotation", [
					k(0, [
						armSwing,
						0,
						0
					]),
					k(.5 * length, [
						-armSwing,
						0,
						0
					]),
					k(length, [
						armSwing,
						0,
						0
					])
				]);
				put(cycle, body, "position", [
					k(0, [
						0,
						0,
						0
					]),
					k(.25 * length, [
						0,
						-.4 * a,
						0
					]),
					k(.5 * length, [
						0,
						0,
						0
					]),
					k(.75 * length, [
						0,
						-.4 * a,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, body, "rotation", [
					k(0, [
						lean,
						0,
						3 * a
					]),
					k(.5 * length, [
						lean,
						0,
						-3 * a
					]),
					k(length, [
						lean,
						0,
						3 * a
					])
				]);
				put(cycle, head, "rotation", [
					k(0, [
						-lean * .6,
						4 * a,
						0
					]),
					k(.5 * length, [
						-lean * .6,
						-4 * a,
						0
					]),
					k(length, [
						-lean * .6,
						4 * a,
						0
					])
				]);
				put(cycle, tail, "rotation", [
					k(0, [
						0,
						8 * a,
						0
					]),
					k(.5 * length, [
						0,
						-8 * a,
						0
					]),
					k(length, [
						0,
						8 * a,
						0
					])
				]);
				notes.push(type === "walk" ? "Walk: opposite-phase limbs, bent joints, small counter-rotation, seamless loop." : "Run: bigger stride, forward lean, more vertical bob — still seamless.");
				return {
					cycle,
					loop: "loop",
					notes
				};
			}
			case "attack": {
				const swing = 70 * a;
				put(cycle, armR, "rotation", [
					k(0, [
						0,
						0,
						0
					], "step"),
					k(.2 * length, [
						-25 * a,
						0,
						0
					]),
					k(.45 * length, [
						swing,
						0,
						0
					]),
					k(.65 * length, [
						swing * .6,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.45 * length, [
						-15 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, body, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.2 * length, [
						0,
						-14 * a,
						0
					]),
					k(.45 * length, [
						0,
						20 * a,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, body, "position", [
					k(0, [
						0,
						0,
						0
					]),
					k(.45 * length, [
						0,
						-.3 * a,
						-.6 * a
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, head, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.45 * length, [
						6 * a,
						10 * a,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				notes.push("Attack swings the right arm FORWARD (+X) with body counter-twist and follow-through.");
				return {
					cycle,
					loop: "once",
					notes
				};
			}
			case "cast":
				put(cycle, armR, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.3 * length, [
						-80 * a,
						0,
						-20 * a
					]),
					k(.6 * length, [
						-70 * a,
						0,
						-15 * a
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.3 * length, [
						-80 * a,
						0,
						20 * a
					]),
					k(.6 * length, [
						-70 * a,
						0,
						15 * a
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, body, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.3 * length, [
						-10 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, head, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.3 * length, [
						-12 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				notes.push("Cast raises both arms and leans back, then settles with follow-through.");
				return {
					cycle,
					loop: "once",
					notes
				};
			case "jump":
				put(cycle, body, "position", [
					k(0, [
						0,
						0,
						0
					]),
					k(.25 * length, [
						0,
						-1.2 * a,
						0
					]),
					k(.55 * length, [
						0,
						3 * a,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, legL, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.25 * length, [
						-30 * a,
						0,
						0
					]),
					k(.55 * length, [
						25 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, legR, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.25 * length, [
						-30 * a,
						0,
						0
					]),
					k(.55 * length, [
						25 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.55 * length, [
						-50 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armR, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.55 * length, [
						-50 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				notes.push("Jump crouches then springs; both legs bend the same way (knees -X).");
				return {
					cycle,
					loop: "once",
					notes
				};
			case "hurt":
				put(cycle, body, "rotation", [
					k(0, [
						0,
						0,
						0
					], "step"),
					k(.15 * length, [
						-16 * a,
						0,
						0
					]),
					k(.5 * length, [
						4 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, head, "rotation", [
					k(0, [
						0,
						0,
						0
					], "step"),
					k(.15 * length, [
						-20 * a,
						8 * a,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armL, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.15 * length, [
						-30 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				put(cycle, armR, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.15 * length, [
						-30 * a,
						0,
						0
					]),
					k(length, [
						0,
						0,
						0
					])
				]);
				return {
					cycle,
					loop: "once",
					notes
				};
			case "death":
				put(cycle, body, "rotation", [
					k(0, [
						0,
						0,
						0
					]),
					k(.4 * length, [
						-20 * a,
						0,
						40 * a
					]),
					k(length, [
						-85 * a,
						0,
						85 * a
					])
				]);
				put(cycle, body, "position", [k(0, [
					0,
					0,
					0
				]), k(length, [
					0,
					-6 * a,
					0
				])]);
				put(cycle, head, "rotation", [k(0, [
					0,
					0,
					0
				]), k(length, [
					-30 * a,
					20 * a,
					0
				])]);
				put(cycle, armL, "rotation", [k(0, [
					0,
					0,
					0
				]), k(length, [
					-40 * a,
					0,
					0
				])]);
				put(cycle, armR, "rotation", [k(0, [
					0,
					0,
					0
				]), k(length, [
					-40 * a,
					0,
					0
				])]);
				notes.push("Death is a fall to the model's side (rotation z) with collapse; loop 'hold'.");
				put(cycle, legL, "rotation", [k(0, [
					0,
					0,
					0
				]), k(length, [
					-25 * a,
					0,
					0
				])]);
				put(cycle, legR, "rotation", [k(0, [
					0,
					0,
					0
				]), k(length, [
					-25 * a,
					0,
					0
				])]);
				return {
					cycle,
					loop: "hold",
					notes
				};
			case "fly": {
				const flap = 55 * a;
				put(cycle, wingL, "rotation", [
					k(0, [
						0,
						0,
						-flap
					]),
					k(.5 * length, [
						0,
						0,
						flap
					]),
					k(length, [
						0,
						0,
						-flap
					])
				]);
				put(cycle, wingR, "rotation", [
					k(0, [
						0,
						0,
						flap
					]),
					k(.5 * length, [
						0,
						0,
						-flap
					]),
					k(length, [
						0,
						0,
						flap
					])
				]);
				put(cycle, body, "position", [
					k(0, [
						0,
						.8 * a,
						0
					]),
					k(.5 * length, [
						0,
						-.8 * a,
						0
					]),
					k(length, [
						0,
						.8 * a,
						0
					])
				]);
				put(cycle, head, "rotation", [k(0, [
					-6 * a,
					0,
					0
				]), k(length, [
					-6 * a,
					0,
					0
				])]);
				put(cycle, legL, "rotation", [k(0, [
					-20 * a,
					0,
					0
				]), k(length, [
					-20 * a,
					0,
					0
				])]);
				put(cycle, legR, "rotation", [k(0, [
					-20 * a,
					0,
					0
				]), k(length, [
					-20 * a,
					0,
					0
				])]);
				notes.push("Fly flaps the wings in opposite z signs so the pair beats symmetrically; legs tuck.");
				return {
					cycle,
					loop: "loop",
					notes
				};
			}
			default: throw new CommandError("E_INVALID_PARAM", `Unknown animation type: ${type}`);
		}
	}
	function requireAnimations() {
		if (!Array.isArray(Animation.all)) throw new CommandError("E_UNSUPPORTED_FORMAT", "Animations are unavailable in this format/plugin set. Create a bedrock or geckolib_model project.");
	}
	function findAnimation(name) {
		requireProject();
		requireAnimations();
		const animation = Animation.all.find((item) => item.name === name);
		if (!animation) throw new CommandError("E_NOT_FOUND", `Animation not found: ${name}. Call list_animations.`);
		return animation;
	}
	function writeChannels(animation, bones) {
		let keyframes = 0;
		for (const { group, channels } of bones) {
			const animator = animation.getBoneAnimator(group);
			if (!animator) throw new CommandError("E_BLOCKBENCH_ERROR", `Cannot create an animator for bone: ${group.name}`);
			for (const channel of [
				"rotation",
				"position",
				"scale"
			]) for (const key of channels[channel] ?? []) {
				animator.addKeyframe({
					channel,
					time: key.time,
					interpolation: key.interpolation ?? "linear",
					data_points: [{
						x: key.value[0],
						y: key.value[1],
						z: key.value[2]
					}]
				});
				keyframes += 1;
			}
		}
		return keyframes;
	}
	function replaceAnimation(name, length, loop, replace) {
		const existing = Animation.all.find((animation) => animation.name === name);
		if (existing && replace !== true) throw new CommandError("E_INVALID_PARAM", `Animation "${name}" already exists; pass replace:true to overwrite it.`);
		if (existing) existing.remove(false, true);
		const created = new Animation({
			name,
			length,
			loop
		});
		created.add(false);
		created.setLength(length);
		return created;
	}
	const animationTools = {
		upsert_animation: (args) => {
			requireProject();
			const bones = Object.entries(args?.bones ?? {}).map(([ref, channels]) => ({
				group: requireGroup(ref),
				channels
			}));
			return withUndo({
				animations: [],
				keyframes: []
			}, `upsert_animation ${args.name}`, (track) => {
				const animation = replaceAnimation(args.name, args.length, args.loop ?? "loop", args.replace);
				track.addAnimations([animation]);
				const keyframes = writeChannels(animation, bones);
				return {
					ok: true,
					undo_label: `upsert_animation ${args.name}`,
					name: args.name,
					keyframes
				};
			});
		},
		generate_animation: (args) => {
			requireProject();
			const type = args?.type;
			const amplitude = args?.amplitude ?? 1;
			const length = args?.length ?? {
				idle: 1.6,
				walk: 1.2,
				run: .9,
				attack: .8,
				cast: 1,
				jump: 1,
				hurt: .6,
				death: 1.4,
				fly: 1.2
			}[type] ?? 1;
			const name = args?.name ?? `animation.${type}`;
			const explicit = args?.bones ?? {};
			const infer = (patterns) => (Group?.all ?? []).find((g) => patterns.some((p) => p.test(g.name)))?.name;
			const { cycle, loop, notes } = buildCycle(type, {
				body: explicit.body ?? infer([/^(body|torso|chest)$/i, /body/i]),
				head: explicit.head ?? infer([/head/i]),
				arm_left: explicit.arm_left ?? infer([/arm.*left|left.*arm/i]),
				arm_right: explicit.arm_right ?? infer([/arm.*right|right.*arm/i]),
				leg_left: explicit.leg_left ?? infer([/leg.*left|left.*leg/i]),
				leg_right: explicit.leg_right ?? infer([/leg.*right|right.*leg/i]),
				tail: explicit.tail ?? infer([/tail/i]),
				wing_left: explicit.wing_left ?? infer([/wing.*left|left.*wing/i]),
				wing_right: explicit.wing_right ?? infer([/wing.*right|right.*wing/i])
			}, length, amplitude);
			const resolved = Object.entries(cycle).map(([ref, channels]) => ({
				group: requireGroup(ref),
				channels
			})).filter((entry) => Object.values(entry.channels).some((keys) => (keys ?? []).length));
			if (!resolved.length) throw new CommandError("E_NOT_FOUND", `No matching bones for a "${type}" cycle. Build the rig first (scaffold_biped), or pass bones:{body:'body', head:'head', ...}.`);
			return withUndo({
				animations: [],
				keyframes: []
			}, `generate_animation ${name}`, (track) => {
				const animation = replaceAnimation(name, length, loop, args?.replace);
				track.addAnimations([animation]);
				const keyframes = writeChannels(animation, resolved);
				return {
					ok: true,
					undo_label: `generate_animation ${name}`,
					name,
					type,
					length,
					loop,
					bones: resolved.map((r) => r.group.name),
					keyframes,
					notes: [...notes, "Now set_timeline_time and capture_views to actually LOOK at the cycle."]
				};
			});
		},
		inspect_animation: (args) => {
			const animation = findAnimation(args?.name);
			const bones = Object.entries(animation.animators ?? {}).map(([id, animator]) => ({
				id,
				name: animator.group?.name ?? id,
				channels: Object.fromEntries([
					"rotation",
					"position",
					"scale"
				].map((channel) => [channel, (animator[channel] ?? []).map((key) => ({
					time: key.time,
					value: key.data_points?.[0] ? [
						key.data_points[0].x,
						key.data_points[0].y,
						key.data_points[0].z
					] : null,
					interpolation: key.interpolation
				}))]))
			}));
			return {
				name: animation.name,
				length: animation.length,
				loop: animation.loop,
				bones,
				summary: {
					bones: bones.length,
					keyframes: bones.reduce((sum, bone) => sum + Object.values(bone.channels).reduce((n, keys) => n + keys.length, 0), 0)
				}
			};
		},
		transform_animation_keys: (args) => {
			const animation = findAnimation(args?.name);
			const wanted = args?.bones ? new Set(args.bones) : null;
			const selected = Object.entries(animation.animators ?? {}).filter(([id, animator]) => !wanted || wanted.has(id) || animator.group?.name && wanted.has(animator.group.name));
			if (wanted && !selected.length) throw new CommandError("E_NOT_FOUND", "None of the requested bones have keys in this animation.");
			const axisIndex = args?.mirror_axis === "x" ? 0 : args?.mirror_axis === "y" ? 1 : 2;
			return withUndo({
				animations: [animation],
				keyframes: []
			}, `transform_animation_keys ${args.name}`, () => {
				let updated = 0;
				for (const [, animator] of selected) for (const channel of [
					"rotations",
					"position",
					"scale"
				]) for (const key of animator[channel] ?? []) {
					key.time = Math.max(0, key.time * (args?.time_scale ?? 1) + (args?.time_offset ?? 0));
					for (const point of key.data_points ?? []) {
						const values = [
							point.x,
							point.y,
							point.z
						];
						for (let i = 0; i < 3; i += 1) values[i] *= args?.value_scale?.[i] ?? 1;
						if (args?.mirror_axis) {
							if (channel === "position") values[axisIndex] *= -1;
							else if (channel === "rotations") {
								for (let i = 0; i < 3; i += 1) if (i !== axisIndex) values[i] *= -1;
							}
						}
						[point.x, point.y, point.z] = values;
					}
					updated += 1;
				}
				if (args?.time_scale !== void 0 || args?.time_offset !== void 0) animation.length = Math.max(.001, animation.length * (args?.time_scale ?? 1) + (args?.time_offset ?? 0));
				return {
					ok: true,
					undo_label: `transform_animation_keys ${args.name}`,
					updated_keyframes: updated,
					length: animation.length
				};
			});
		},
		delete_animation: (args) => {
			const animation = findAnimation(args?.name);
			return withUndo({ animations: [animation] }, `delete_animation ${args.name}`, () => {
				animation.remove(false, true);
				return {
					ok: true,
					undo_label: `delete_animation ${args.name}`,
					deleted: args.name
				};
			});
		},
		set_timeline_time: (args) => {
			requireProject();
			if (args?.animation) findAnimation(args.animation).select();
			try {
				Timeline.setTime(args?.time ?? 0);
				Canvas.updateAll();
			} catch {
				throw new CommandError("E_BLOCKBENCH_ERROR", "Timeline API unavailable in this format.");
			}
			return {
				ok: true,
				time: args?.time ?? 0,
				animation: args?.animation ?? null,
				note: "The model is now posed at this time — call capture_views to look at the frame."
			};
		}
	};
	//#endregion
	//#region src/tools/quality.ts
	const qualityTools = {
		check_model: (args) => {
			requireProject();
			const result = checkModel(snapshotElements(), {
				textureWidth: Project?.texture_width ?? 16,
				textureHeight: Project?.texture_height ?? 16,
				uvIslands: uvIslands(),
				allowOverlaps: args?.allow_overlaps
			});
			return {
				...result,
				ready: result.summary.errors === 0,
				note: result.summary.errors === 0 ? "No blocking errors. Address warnings before texturing, then re-run after painting." : "Fix every error before texturing or exporting."
			};
		},
		audit_complexity: (args) => {
			requireProject();
			return auditComplexity(snapshotElements(), args ?? {});
		},
		check_rig: () => {
			requireProject();
			const result = checkRig(snapshotElements());
			return {
				...result,
				note: result.summary.ready ? "Rig looks animation-ready (3 segments per limb, every cube parented)." : "Fix the errors before authoring animation."
			};
		}
	};
	//#endregion
	//#region src/tools/views.ts
	const DEFAULT_VIEWS = [
		"iso",
		"north",
		"east",
		"south"
	];
	const VIEW_LABELS = {
		north: "front — the model's FACE (front views are mirrored: its right hand is on the left of the image)",
		south: "back — the model's other side",
		east: "the model's own RIGHT side (+X)",
		west: "the model's own LEFT side (-X)",
		up: "top-down",
		down: "bottom-up",
		iso: "isometric (three-quarter) view"
	};
	async function loadImage(dataUrl) {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => reject(new CommandError("E_BLOCKBENCH_ERROR", "Cannot decode captured image."));
			image.src = dataUrl;
		});
	}
	async function silhouetteOf(dataUrl, alphaThreshold = 8, luminanceThreshold = 245) {
		const image = await loadImage(dataUrl);
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth || 64;
		canvas.height = image.naturalHeight || 64;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context for silhouette analysis.");
		ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
		return {
			...silhouetteFromRgba(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, alphaThreshold, luminanceThreshold),
			dataUrl
		};
	}
	const viewTools = {
		capture_views: async (args) => {
			requireProject();
			const views = args?.views?.length ? args.views : DEFAULT_VIEWS;
			const maxEdge = Math.min(args?.max_edge ?? 256, 1024);
			const format = args?.format ?? "jpeg";
			const quality = (args?.quality ?? 70) / 100;
			const out = [];
			for (const view of views) {
				const compressed = await compressImage(await captureView(view, maxEdge), format, quality, maxEdge);
				out.push({
					view,
					caption: VIEW_LABELS[view] ?? view,
					visible_face: view === "iso" ? null : view,
					width: compressed.width,
					height: compressed.height,
					bytes: Math.floor((compressed.dataUrl.split(",")[1]?.length ?? 0) * .75),
					mime: compressed.dataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
					data_url: compressed.dataUrl
				});
			}
			return {
				views: out,
				note: "Views are named from the MODEL's point of view. A front (north) view is mirrored, exactly like facing a person. Capture does not move the model or the user's camera."
			};
		},
		analyze_view_silhouette: async (args) => {
			requireProject();
			const views = args?.views?.length ? args.views : DEFAULT_VIEWS;
			const maxEdge = Math.min(args?.max_edge ?? 256, 1024);
			const rows = [];
			for (const view of views) {
				const raw = await captureView(view, maxEdge);
				const silhouette = await silhouetteOf(raw.dataUrl, args?.alpha_threshold, args?.luminance_threshold);
				const bounds = silhouetteBounds(silhouette);
				const foreground = silhouette.mask.reduce((sum, v) => sum + v, 0);
				rows.push({
					view,
					width: silhouette.width,
					height: silhouette.height,
					bounds,
					silhouette_size: [bounds[2] - bounds[0], bounds[3] - bounds[1]],
					foreground_pixels: foreground,
					coverage: Number((foreground / Math.max(1, silhouette.width * silhouette.height)).toFixed(4)),
					data_url: raw.dataUrl
				});
			}
			const empty = rows.filter((row) => row.foreground_pixels === 0);
			return {
				views: rows,
				summary: {
					views: rows.length,
					empty_views: empty.length,
					note: empty.length ? "Some views render nothing — the model may be off-camera, invisible, or inside another object." : "Every view shows geometry."
				}
			};
		},
		set_camera_angle: (args) => {
			requireProject();
			const preset = args?.preset;
			const chosen = preset ? {
				north: {
					position: [
						0,
						0,
						-100
					],
					target: [
						0,
						0,
						0
					]
				},
				south: {
					position: [
						0,
						0,
						100
					],
					target: [
						0,
						0,
						0
					]
				},
				east: {
					position: [
						100,
						0,
						0
					],
					target: [
						0,
						0,
						0
					]
				},
				west: {
					position: [
						-100,
						0,
						0
					],
					target: [
						0,
						0,
						0
					]
				},
				up: {
					position: [
						0,
						100,
						1
					],
					target: [
						0,
						0,
						0
					]
				},
				down: {
					position: [
						0,
						-100,
						1
					],
					target: [
						0,
						0,
						0
					]
				},
				iso: {
					position: [
						80,
						60,
						80
					],
					target: [
						0,
						0,
						0
					]
				}
			}[preset] : void 0;
			const position = args?.position ?? chosen?.position;
			const target = args?.target ?? chosen?.target;
			if (!position) throw new CommandError("E_INVALID_PARAM", "Pass a preset, or an explicit position (+ target).");
			try {
				const previews = Preview.all;
				if (!previews.length) throw new Error("no preview");
				for (const preview of previews) {
					const camera = preview.camera;
					camera.position.set(position[0], position[1], position[2]);
					const lookAt = target ?? [
						0,
						0,
						0
					];
					camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
					preview.render();
				}
				Canvas.updateAll();
			} catch {
				throw new CommandError("E_BLOCKBENCH_ERROR", "Could not set the viewport camera in this Blockbench build; capture_views uses its own offscreen camera and is unaffected.");
			}
			return {
				ok: true,
				position,
				target: target ?? null
			};
		}
	};
	async function compressImage(source, format, quality, maxEdge) {
		if (format === "png" && source.dataUrl.startsWith("data:image/png")) return source;
		const image = await loadImage(source.dataUrl);
		const canvas = document.createElement("canvas");
		const width = image.naturalWidth || source.width;
		const height = image.naturalHeight || source.height;
		const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) return source;
		ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
		return {
			dataUrl: format === "jpeg" ? canvas.toDataURL("image/jpeg", quality) : canvas.toDataURL("image/png"),
			width: canvas.width,
			height: canvas.height
		};
	}
	//#endregion
	//#region src/tools/reference.ts
	async function decode(dataUrl) {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve({
				width: image.naturalWidth,
				height: image.naturalHeight
			});
			image.onerror = () => reject(new CommandError("E_INVALID_PARAM", "Cannot decode the reference image."));
			image.src = dataUrl;
		});
	}
	function base64Of(bytes) {
		let binary = "";
		for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + 32768)));
		return btoa(binary);
	}
	function pick(reference) {
		if (!session.references.length) return void 0;
		if (!reference) return session.references[session.references.length - 1];
		return session.references.find((r) => r.id === reference) ?? session.references.find((r) => r.name === reference) ?? session.references[Number(reference)];
	}
	function compositeDataUrl(referenceMask, modelMask, size) {
		const scale = 4;
		const canvas = document.createElement("canvas");
		canvas.width = size * scale * 3 + 16;
		canvas.height = size * scale;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new CommandError("E_BLOCKBENCH_ERROR", "No 2d context for the composite.");
		ctx.fillStyle = "#101318";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		const draw = (mask, offset, color) => {
			ctx.fillStyle = color;
			for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (mask[y * size + x]) ctx.fillRect(offset + x * scale, y * scale, scale, scale);
		};
		draw(referenceMask, 0, "#4b5563");
		draw(modelMask, size * scale + 8, "#4b5563");
		const overlayOffset = size * scale * 2 + 16;
		for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
			const inRef = referenceMask[y * size + x] === 1;
			const inModel = modelMask[y * size + x] === 1;
			if (!inRef && !inModel) continue;
			ctx.fillStyle = inRef && inModel ? "#f8fafc" : inRef ? "#ef4444" : "#3b82f6";
			ctx.fillRect(overlayOffset + x * scale, y * scale, scale, scale);
		}
		return canvas.toDataURL("image/png");
	}
	const referenceTools = {
		load_reference: async (args) => {
			let dataUrl = args?.data_url;
			let source = "data_url";
			if (!dataUrl && args?.path) {
				dataUrl = `data:image/png;base64,${base64Of(readScopedFile(args.path))}`;
				source = args.path;
			}
			if (!dataUrl) throw new CommandError("E_INVALID_PARAM", "Pass either path (inside the approved directory) or data_url ('data:image/png;base64,...').");
			const size = await decode(dataUrl);
			session.referenceSeq += 1;
			const reference = {
				id: `ref-${session.referenceSeq}`,
				name: args?.name ?? `reference_${session.referenceSeq}`,
				data_url: dataUrl,
				width: size.width,
				height: size.height,
				source,
				addedAt: Date.now()
			};
			session.references.push(reference);
			return {
				ok: true,
				id: reference.id,
				name: reference.name,
				width: reference.width,
				height: reference.height,
				source,
				note: "Call compare_reference every modeling pass until match_percent >= 85."
			};
		},
		list_references: () => ({
			count: session.references.length,
			references: session.references.map((r) => ({
				id: r.id,
				name: r.name,
				width: r.width,
				height: r.height,
				source: r.source,
				added_at: r.addedAt
			}))
		}),
		get_reference: (args) => {
			const wanted = args?.id ?? args?.name;
			const list = wanted ? [pick(wanted)].filter(Boolean) : session.references;
			if (!list.length) throw new CommandError("E_NOT_FOUND", "No reference image loaded. Use load_reference or call list_references.");
			return {
				count: list.length,
				references: list.map((reference) => ({
					id: reference.id,
					name: reference.name,
					width: reference.width,
					height: reference.height,
					data_url: reference.data_url
				})),
				note: "Actually LOOK at these before building, and re-look during the build."
			};
		},
		clear_references: () => {
			const count = session.references.length;
			session.references = [];
			return {
				ok: true,
				cleared: count
			};
		},
		compare_reference: async (args) => {
			requireProject();
			const reference = pick(args?.reference);
			if (!reference) throw new CommandError("E_NOT_FOUND", "No reference loaded — ask the user to drop one in, or call load_reference with a path/data_url.");
			const view = args?.view ?? "north";
			const result = compareSilhouettes(await silhouetteOf((await captureView(view, 512)).dataUrl, args?.alpha_threshold), await silhouetteOf(reference.data_url, args?.alpha_threshold), 64);
			const composite = compositeDataUrl(result.reference_mask, result.model_mask, result.grid_size);
			const { model_mask, reference_mask, ...summary } = result;
			return {
				...summary,
				reference: reference.name,
				view,
				reference_size: [reference.width, reference.height],
				composite_data_url: composite,
				composite_legend: "left = reference, middle = your model, right = overlay (white match, red missing mass, blue extra mass)",
				note: summary.match_percent >= 85 ? "Silhouette match is good. Keep going with detail and texture." : "Iterate: act on the advice, then compare again. Do not declare a match by eye."
			};
		}
	};
	//#endregion
	//#region src/tools/review.ts
	const REVIEW_OPTIONS = ["Approve", "Needs changes"];
	async function showCard(review, title, question, details) {
		const dialog = showBlockingDialog({
			id: review.id,
			title,
			message: `${question}${details ? `\n\n${details}` : ""}`,
			buttons: review.options
		});
		const expiry = setTimeout(() => {
			dialog.close();
			dismissReview(review);
		}, Math.max(1e3, review.expiresAt - Date.now()));
		const result = await dialog.result;
		clearTimeout(expiry);
		answerReview(review.id, result.index, result.comment);
	}
	const reviewTools = {
		ask_user: async (args) => {
			const options = args?.options?.length ? args.options : ["Yes", "No"];
			const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
			const review = openReview({
				kind: "question",
				title: args?.title ?? "Blockbench MCP — question",
				question: args?.question,
				options,
				timeoutSeconds: args?.timeout_seconds ?? 900
			});
			showCard(review, args?.title ?? "Question from the AI", args?.question, args?.details);
			const views = await captureViewsSafe(args?.views);
			await waitForReview(review, waitSeconds);
			return {
				...reviewPayload(review, waitSeconds),
				views,
				note: review.answer ? "The user answered." : review.dismissed ? "The user closed the dialog without answering (dismissed) — still pending. Re-ask with a shorter question, or keep waiting with wait_review." : "pending:true means the card is still open. Call wait_review with this review_id to keep waiting — pending is NOT approval."
			};
		},
		request_review: async (args) => {
			requireProject();
			const options = args?.options?.length ? args.options : REVIEW_OPTIONS;
			const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
			const review = openReview({
				kind: "review",
				title: args?.title ?? "Blockbench MCP — review",
				question: args?.question,
				options,
				timeoutSeconds: args?.timeout_seconds ?? 900
			});
			showCard(review, args?.title ?? "Please review the current model", args?.question, args?.details);
			const views = await captureViewsSafe(args?.views, args?.animation, args?.times);
			await waitForReview(review, waitSeconds);
			return {
				...reviewPayload(review, waitSeconds),
				views,
				note: review.answer ? review.answer.index === 0 ? "Approved. Continue." : "Needs changes: fix exactly what the user said, then ask again. Do not argue with the verdict." : review.dismissed ? "The user dismissed the dialog without answering — still pending, not approval. Ask again later or keep polling with wait_review." : "pending — the dialog stays open in Blockbench. Poll with wait_review; pending is not approval and neither is a timeout."
			};
		},
		wait_review: async (args) => {
			const waitSeconds = Math.min(args?.wait_seconds ?? 25, 120);
			const review = args?.review_id ? session.pending.get(args.review_id) : latestOpenReview(true);
			if (!review) throw new CommandError("E_NOT_FOUND", "No review/question found. Call request_review or ask_user first.");
			await waitForReview(review, waitSeconds);
			return {
				...reviewPayload(review, waitSeconds),
				open_cards: [...session.pending.values()].filter((r) => !r.answer).length,
				note: review.answer ? "Answered." : "Still waiting for the user. Keep polling and tell them in chat that you are waiting; do not proceed as if it were approved."
			};
		}
	};
	async function captureViewsSafe(views, animation, times) {
		const wanted = views?.length ? views : ["north", "east"];
		const out = [];
		for (const time of animation ? times?.length ? times : [0] : [null]) {
			if (time !== null) try {
				if (animation) Animation.all.find((item) => item.name === animation)?.select();
				Timeline.setTime(time);
			} catch {}
			for (const view of wanted) try {
				const shot = await captureView(view, 256);
				out.push({
					view,
					time,
					caption: `${view}${time !== null ? ` @ t=${time}s` : ""}`,
					data_url: shot.dataUrl
				});
			} catch {}
		}
		return out;
	}
	//#endregion
	//#region src/tools/coverage.ts
	function barItems() {
		return BarItems ?? {};
	}
	function settingsMap() {
		return settings ?? {};
	}
	const coverageTools = {
		list_actions: (args) => {
			const filter = (args?.filter ?? "").toLowerCase();
			const actions = Object.entries(barItems()).map(([id, item]) => ({
				id,
				name: item?.name ?? item?.title ?? id,
				description: item?.description ?? null,
				icon: item?.icon ?? null,
				category: item?.category ?? null,
				type: item?.type ?? null
			})).filter((entry) => !filter || entry.id.toLowerCase().includes(filter) || entry.name.toLowerCase().includes(filter)).sort((a, b) => a.id.localeCompare(b.id));
			return {
				count: actions.length,
				actions,
				note: "Run any of these with run_action {id, value}. Dedicated tools are preferred where they exist."
			};
		},
		get_action: (args) => {
			const item = barItems()[args?.id];
			if (!item) throw new CommandError("E_NOT_FOUND", `Unknown action id: ${args?.id}. Use list_actions.`);
			return {
				id: args.id,
				name: item.name ?? args.id,
				description: item.description ?? null,
				icon: item.icon ?? null,
				category: item.category ?? null,
				type: item.type ?? null,
				value: item.value ?? null,
				has_click: typeof item.click === "function"
			};
		},
		run_action: (args) => {
			const item = barItems()[args?.id];
			if (!item) throw new CommandError("E_NOT_FOUND", `Unknown action id: ${args?.id}. Use list_actions.`);
			if (typeof item.click !== "function") throw new CommandError("E_INVALID_PARAM", `Action "${args.id}" has no click handler.`);
			const result = args?.value === void 0 ? item.click() : item.click(args.value);
			return {
				ok: true,
				id: args.id,
				result: typeof result === "boolean" || typeof result === "string" || typeof result === "number" ? result : null
			};
		},
		select_action: (args) => {
			requireProject();
			try {
				if (args?.mode !== "add") unselectAll();
				for (const ref of args.refs) {
					const element = (Group?.all ?? []).find((g) => g.uuid === ref || g.name === ref) ?? (Cube?.all ?? []).find((c) => c.uuid === ref || c.name === ref);
					if (!element) throw new CommandError("E_NOT_FOUND", `Element not found: ${ref}`);
					element.select?.();
				}
				globalThis.updateSelection?.();
				return {
					ok: true,
					selected: args.refs.length
				};
			} catch (err) {
				if (err instanceof CommandError) throw err;
				throw new CommandError("E_BLOCKBENCH_ERROR", "Could not change the selection in this build.");
			}
		},
		list_modes: () => {
			const modes = Modes.options;
			const selected = Modes.selected;
			return {
				modes: Object.entries(modes).map(([id, mode]) => ({
					id: mode?.id ?? id,
					name: mode?.name ?? id,
					active: mode === selected || mode?.id && mode.id === selected?.id || false
				})),
				selected: selected?.id ?? null
			};
		},
		set_mode: (args) => {
			const mode = Modes.options[args?.id];
			if (!mode) throw new CommandError("E_NOT_FOUND", `Unknown mode: ${args?.id}. Use list_modes.`);
			try {
				mode.select?.();
			} catch {
				throw new CommandError("E_BLOCKBENCH_ERROR", `Cannot switch to mode "${args.id}" in this build.`);
			}
			return {
				ok: true,
				mode: mode.id ?? args.id
			};
		},
		list_settings: (args) => {
			const entries = Object.entries(settingsMap()).map(([id, setting]) => ({
				id,
				name: setting?.name ?? id,
				value: setting?.value ?? null,
				type: setting?.type ?? (typeof setting?.value === "undefined" ? "unknown" : typeof setting.value),
				category: setting?.category ?? null,
				description: setting?.description ?? null
			})).filter((entry) => !args?.category || entry.category === args.category);
			return {
				count: entries.length,
				settings: entries
			};
		},
		get_setting: (args) => {
			const setting = settingsMap()[args?.id];
			if (!setting) throw new CommandError("E_NOT_FOUND", `Unknown setting: ${args?.id}. Use list_settings.`);
			return {
				id: args.id,
				name: setting.name ?? args.id,
				value: setting.value ?? null,
				type: setting.type ?? null,
				category: setting.category ?? null
			};
		},
		set_setting: (args) => {
			const setting = settingsMap()[args?.id];
			if (!setting) throw new CommandError("E_NOT_FOUND", `Unknown setting: ${args?.id}. Use list_settings.`);
			if (typeof setting.set === "function") setting.set(args?.value);
			else setting.value = args?.value;
			return {
				ok: true,
				id: args.id,
				value: setting.value
			};
		},
		list_plugins: () => {
			const describe = (plugin) => ({
				id: plugin.id,
				title: plugin.title,
				version: plugin.version ?? null,
				author: plugin.author ?? null,
				installed: Boolean(plugin.installed),
				disabled: Boolean(plugin.disabled)
			});
			const all = Plugins.all.map(describe);
			return {
				plugins: all,
				summary: {
					total: all.length,
					installed: all.filter((entry) => entry.installed).length,
					available: all.filter((entry) => !entry.installed).length
				},
				note: "installed:true 的是已安装;其余是商店里可安装的(用 install_plugin {id} 装)。"
			};
		},
		install_plugin: async (args) => {
			if (!(args?.url ?? args?.id)) throw new CommandError("E_INVALID_PARAM", "Pass id (a plugin store id, e.g. 'geckolib') or url.");
			const plugins = Plugins;
			if (plugins.loading_promise) await plugins.loading_promise.catch(() => void 0);
			if (args?.url) {
				await new Plugin().loadFromURL(args.url, true);
				return {
					ok: true,
					source: "url",
					url: args.url,
					note: "如果 Blockbench 弹出权限/确认对话框,用户需要点同意后格式才会出现。"
				};
			}
			const plugin = Plugins.all.find((entry) => entry.id === args.id);
			if (!plugin) throw new CommandError("E_NOT_FOUND", `Plugin "${args.id}" not found. Call list_plugins to see store entries (installed:false).`);
			if (plugin.installed) return {
				ok: true,
				already: true,
				id: plugin.id,
				title: plugin.title
			};
			const installable = plugin.isInstallable?.();
			if (installable !== true && typeof installable === "string") throw new CommandError("E_UNSUPPORTED_FORMAT", `Cannot install "${args.id}" here: ${installable}`);
			await plugin.install();
			return {
				ok: true,
				installed: Boolean(plugin.installed),
				id: plugin.id,
				title: plugin.title,
				note: "安装完成后相关格式才会出现在 list_formats;必要时让用户重启 Blockbench。"
			};
		},
		uninstall_plugin: (args) => {
			const plugin = Plugins.all.find((entry) => entry.id === args?.id || entry.title === args?.id);
			if (!plugin) throw new CommandError("E_NOT_FOUND", `Plugin not found: ${args?.id}`);
			if (!plugin.installed) throw new CommandError("E_INVALID_PARAM", `Plugin is not installed: ${args?.id}`);
			if (typeof plugin.uninstall !== "function") throw new CommandError("E_BLOCKBENCH_ERROR", "This plugin cannot be uninstalled programmatically.");
			plugin.uninstall();
			return {
				ok: true,
				uninstalled: args.id
			};
		},
		undo: () => {
			try {
				Undo.undo(false);
				return {
					ok: true,
					action: "undo"
				};
			} catch {
				throw new CommandError("E_BLOCKBENCH_ERROR", "Undo is unavailable right now.");
			}
		},
		redo: () => {
			try {
				Undo.redo(false);
				return {
					ok: true,
					action: "redo"
				};
			} catch {
				throw new CommandError("E_BLOCKBENCH_ERROR", "Redo is unavailable right now.");
			}
		},
		execute_script: async (args) => {
			if (!settings?.bbmcp_allow_execute_script?.value) throw new CommandError("E_AUTH_FAILED", "execute_script is disabled. The user can enable it in Settings ▸ General ▸ 'Allow execute_script'.");
			if (typeof args?.code !== "string" || !args.code.trim()) throw new CommandError("E_INVALID_PARAM", "Pass the JavaScript body in `code`.");
			const timeoutMs = Math.min((args?.timeout_seconds ?? 30) * 1e3, 12e4);
			const run = new Function(`return (async () => {\n${args.code}\n})();`);
			const result = await Promise.race([run(), new Promise((_, reject) => setTimeout(() => reject(new CommandError("E_TIMEOUT", `Script exceeded ${timeoutMs / 1e3}s.`)), timeoutMs))]);
			let serialized = result;
			try {
				serialized = JSON.parse(JSON.stringify(result ?? null));
			} catch {
				serialized = typeof result === "object" && result !== null ? {
					note: "Return value is not JSON-serializable (circular or a Blockbench object). Return primitives (numbers, strings, arrays of plain objects).",
					keys: Object.keys(result).slice(0, 20),
					ctor: result.constructor?.name ?? "unknown"
				} : String(result);
			}
			return {
				ok: true,
				result: serialized
			};
		}
	};
	//#endregion
	//#region src/dispatch.ts
	const handlers = {
		...statusTools,
		...projectTools,
		...geometryTools,
		...generatorTools,
		...paintTools,
		...animationTools,
		...qualityTools,
		...viewTools,
		...referenceTools,
		...reviewTools,
		...coverageTools
	};
	function coerceArguments(value, depth = 0) {
		if (depth > 12) return value;
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) try {
				return coerceArguments(JSON.parse(trimmed), depth + 1);
			} catch {
				return value;
			}
			return value;
		}
		if (Array.isArray(value)) return value.map((item) => coerceArguments(item, depth + 1));
		if (value && typeof value === "object") {
			const out = {};
			for (const [key, item] of Object.entries(value)) out[key] = coerceArguments(item, depth + 1);
			return out;
		}
		return value;
	}
	async function runTool(name, rawArgs) {
		const spec = TOOL_SPECS[name];
		if (!spec) {
			const error = toErrorPayload(new CommandError("E_UNSUPPORTED_COMMAND", `Unknown tool: ${name}. Call tools/list for the supported set.`));
			return {
				ok: false,
				summary: error.message,
				error
			};
		}
		const handler = handlers[name];
		if (!handler) {
			const error = toErrorPayload(new CommandError("E_UNSUPPORTED_COMMAND", `Tool "${name}" has no implementation.`));
			return {
				ok: false,
				summary: error.message,
				error
			};
		}
		const coerced = coerceArguments(rawArgs ?? {});
		const parsed = spec.params.safeParse(coerced);
		if (!parsed.success) {
			const error = toErrorPayload(new CommandError("E_INVALID_PARAM", `Invalid parameters for ${name} — ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}`, parsed.error.flatten()));
			return {
				ok: false,
				summary: error.message,
				error
			};
		}
		try {
			const result = await handler(parsed.data);
			return {
				ok: true,
				summary: `OK: ${name}`,
				result: result ?? null
			};
		} catch (err) {
			const error = toErrorPayload(err);
			return {
				ok: false,
				summary: error.message,
				error
			};
		}
	}
	function registeredToolNames() {
		return Object.keys(TOOL_SPECS).filter((name) => Boolean(handlers[name]));
	}
	//#endregion
	//#region src/rpc.ts
	function text(value) {
		return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "(undefined)";
	}
	function attachImages(result) {
		const images = [];
		const strip = (value, key) => {
			if (typeof value === "string") {
				if (value.startsWith("data:image/")) {
					const match = /^data:([^;]+);base64,(.+)$/.exec(value);
					if (match) images.push({
						type: "image",
						data: match[2],
						mimeType: match[1]
					});
					return `[image:${key ?? "image"}]`;
				}
				return value;
			}
			if (Array.isArray(value)) return value.map((item) => strip(item));
			if (value && typeof value === "object") {
				const out = {};
				for (const [k, item] of Object.entries(value)) out[k] = strip(item, k);
				return out;
			}
			return value;
		};
		return {
			payload: strip(result),
			images
		};
	}
	function resourcesList() {
		return { resources: GUIDE_TOPICS.map((topic) => ({
			uri: `blockbench-guide://${topic}`,
			name: `guide-${topic}`,
			title: `Blockbench playbook: ${topic}`,
			description: `How to do ${topic} well in Blockbench (read before acting).`,
			mimeType: "text/markdown"
		})).concat([{
			uri: "blockbench-mcp://activity",
			name: "activity-log",
			title: "Recent MCP activity",
			description: "Ring buffer of the last tool calls, with timing and failures.",
			mimeType: "application/json"
		}]) };
	}
	function readResource(uri) {
		if (uri.startsWith("blockbench-guide://")) return { contents: [{
			uri,
			mimeType: "text/markdown",
			text: resolveGuide(uri.replace("blockbench-guide://", "")).text
		}] };
		if (uri === "blockbench-mcp://activity") return { contents: [{
			uri,
			mimeType: "application/json",
			text: JSON.stringify({
				activity: session.activity.slice(-100),
				scoped_directory: session.scopedDirectory,
				references: session.references.length,
				open_reviews: [...session.pending.values()].filter((r) => !r.answer).length
			}, null, 2)
		}] };
		return null;
	}
	function promptsList() {
		return { prompts: [{
			name: "model_from_reference",
			description: "Build a detailed Blockbench model that matches a reference image, using the full loop.",
			arguments: [{
				name: "reference_name",
				description: "Reference id/name already loaded",
				required: false
			}, {
				name: "format",
				description: "Target format id (e.g. bedrock, java_block)",
				required: false
			}]
		}, {
			name: "polish_model",
			description: "Raise a blockout to a detailed model: audit, generators, UV pass, texture pass, review.",
			arguments: [{
				name: "target",
				description: "prop | character | creature | hero",
				required: false
			}]
		}] };
	}
	function promptMessages(name, args) {
		if (name === "model_from_reference") {
			const reference = String(args?.reference_name ?? "the loaded reference");
			return {
				description: "Reference-matched modeling loop",
				messages: [{
					role: "user",
					content: {
						type: "text",
						text: [
							`Build a detailed ${String(args?.format ?? "bedrock")} model matching ${reference}.`,
							"1. health, get_project_summary, get_guide(modeling), get_guide(reference).",
							"2. get_reference and actually look at it.",
							"3. create_project with the right uv_mode, then scaffold the rough masses.",
							`4. compare_reference after every pass until match_percent >= 85. Use measure_model for the numbers.`,
							"5. Add real detail with add_hollow_volume / generate_array / extrude_chain / voxelize_matrix.",
							"6. audit_complexity (must not be too_primitive), then pack_box_uv, shade_model_base, paint_face_features.",
							"7. check_model + capture_views, fix what you see, then request_review before declaring it done."
						].join("\n")
					}
				}]
			};
		}
		return {
			description: "Polish an existing blockout",
			messages: [{
				role: "user",
				content: {
					type: "text",
					text: [
						`Raise the current model to a polished ${String(args?.target ?? "character")}.`,
						"1. get_project_summary + check_model + audit_complexity to see where it stands.",
						"2. get_guide(detailing) and add layering/silhouette breakers with the generators.",
						"3. Re-run audit_complexity until it is not too_primitive.",
						"4. pack_box_uv -> shade_model_base -> paint_face_features -> audit_texture_quality.",
						"5. check_model, capture_views, then request_review."
					].join("\n")
				}
			}]
		};
	}
	async function handleMcp(message) {
		if (Array.isArray(message)) {
			const responses = [];
			for (const item of message) {
				const single = await handleOne(item);
				if (single.body) responses.push(JSON.parse(single.body));
			}
			return {
				status: 200,
				body: JSON.stringify(responses)
			};
		}
		return handleOne(message);
	}
	async function handleOne(message) {
		if (!message || typeof message !== "object") return {
			status: 400,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32700,
					message: "Parse error"
				}
			})
		};
		const msg = message;
		const hasId = Object.prototype.hasOwnProperty.call(msg, "id");
		const id = hasId ? msg.id : null;
		const method = msg.method;
		if (!method) return {
			status: 400,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id,
				error: {
					code: -32600,
					message: "Invalid Request"
				}
			})
		};
		if (!hasId && method.startsWith("notifications/")) return { status: 202 };
		const ok = (result) => ({
			status: 200,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id,
				result
			})
		});
		switch (method) {
			case "initialize": return {
				status: 200,
				sessionId: `bbmcp-${Date.now().toString(36)}`,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id,
					result: {
						protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
						capabilities: {
							tools: {},
							resources: {},
							prompts: {}
						},
						serverInfo: {
							name: PROTOCOL_NAME,
							version: PLUGIN_VERSION
						},
						instructions: "Blockbench modeling server. Start with health, get_guide and get_project_summary. Use the generators for detail, the quality gates before texturing, and request_review before claiming work is finished."
					}
				})
			};
			case "ping": return ok({});
			case "tools/list": return ok({ tools: listToolsPayload() });
			case "tools/call": {
				const name = msg.params?.name ?? "";
				const started = Date.now();
				const envelope = await runTool(name, msg.params?.arguments);
				const { payload, images } = attachImages(envelope.result);
				const content = [{
					type: "text",
					text: text({
						ok: envelope.ok,
						summary: envelope.summary,
						...envelope.ok ? { result: payload } : { error: envelope.error }
					})
				}, ...images];
				session.activity.push({
					at: started,
					tool: name,
					ok: envelope.ok,
					ms: Date.now() - started
				});
				if (session.activity.length > 200) session.activity.splice(0, session.activity.length - 200);
				return ok({
					content,
					isError: !envelope.ok
				});
			}
			case "resources/list": return ok(resourcesList());
			case "resources/read": {
				const resource = readResource(String(msg.params?.uri ?? ""));
				if (!resource) return {
					status: 200,
					body: JSON.stringify({
						jsonrpc: "2.0",
						id,
						error: {
							code: -32602,
							message: `Unknown resource: ${msg.params?.uri}`
						}
					})
				};
				return ok(resource);
			}
			case "prompts/list": return ok(promptsList());
			case "prompts/get": {
				const name = String(msg.params?.name ?? "");
				if (name !== "model_from_reference" && name !== "polish_model") return {
					status: 200,
					body: JSON.stringify({
						jsonrpc: "2.0",
						id,
						error: {
							code: -32602,
							message: `Unknown prompt: ${name}`
						}
					})
				};
				return ok(promptMessages(name, msg.params?.arguments ?? {}));
			}
			default: return {
				status: 200,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32601,
						message: `Method not found: ${method}`
					}
				})
			};
		}
	}
	//#endregion
	//#region src/http.ts
	const MAX_BODY = 8388608;
	const LOOPBACK_HOSTS = new Set([
		"127.0.0.1",
		"localhost",
		"::1",
		"[::1]"
	]);
	function statusText(status) {
		return {
			200: "OK",
			202: "Accepted",
			204: "No Content",
			400: "Bad Request",
			401: "Unauthorized",
			403: "Forbidden",
			404: "Not Found",
			405: "Method Not Allowed",
			413: "Payload Too Large",
			415: "Unsupported Media Type",
			500: "Internal Server Error"
		}[status] ?? "Error";
	}
	const BUSY_TIMEOUT_MS = 12e4;
	function respond(socket, status, body, extraHeaders = {}) {
		const tagged = socket;
		if (tagged.__bbmcpReplied) return;
		tagged.__bbmcpReplied = true;
		const payload = body ?? "";
		const headers = [`HTTP/1.1 ${status} ${statusText(status)}`, "Connection: close"];
		for (const [key, value] of Object.entries(extraHeaders)) headers.push(`${key}: ${value}`);
		if (body !== void 0) {
			headers.push("Content-Type: application/json; charset=utf-8");
			headers.push(`Content-Length: ${new TextEncoder().encode(payload).length}`);
		} else headers.push("Content-Length: 0");
		try {
			socket.write(`${headers.join("\r\n")}\r\n\r\n${payload}`);
		} finally {
			try {
				socket.destroy();
			} catch {}
		}
	}
	function authorized(headers, secret) {
		const value = headers.authorization ?? "";
		if (value.toLowerCase().startsWith("bearer ")) return value.slice(7).trim() === secret;
		return headers["x-mcp-secret"] === secret;
	}
	function startHttpServer(config) {
		const net = requireNodeModule("net");
		if (!net?.createServer) throw new Error("Network access (net module) was denied. Allow it for this plugin, then Start MCP Server.");
		let listening = false;
		let requests = 0;
		const handle = {
			port: config.port,
			requests: 0,
			running: () => listening,
			stop: () => {
				listening = false;
				try {
					server?.close?.();
				} catch {}
			}
		};
		const onRequest = async (method, path, headers, body, socket) => {
			requests += 1;
			handle.requests = requests;
			const route = path.split("?")[0];
			if (headers.origin !== void 0) {
				respond(socket, 403, JSON.stringify({ error: "Browser requests are not accepted (Origin header present)." }));
				return;
			}
			const host = String(headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
			if (host && !LOOPBACK_HOSTS.has(host)) {
				respond(socket, 403, JSON.stringify({ error: "Host must be 127.0.0.1 or localhost." }));
				return;
			}
			if (route === "/health") {
				respond(socket, 200, JSON.stringify({
					ok: true,
					server: PROTOCOL_NAME,
					version: PLUGIN_VERSION,
					mcp: `http://127.0.0.1:${config.port}/mcp`,
					auth: "Bearer token required (Settings ▸ General ▸ MCP Access Token)"
				}));
				return;
			}
			if (route !== "/mcp") {
				respond(socket, 404, JSON.stringify({ error: `Unknown route: ${route}. Use POST /mcp.` }));
				return;
			}
			if (method === "OPTIONS") {
				respond(socket, 204);
				return;
			}
			if (method === "DELETE") {
				respond(socket, 200, JSON.stringify({ ok: true }));
				return;
			}
			if (method !== "POST") {
				respond(socket, 405, JSON.stringify({ error: "Use POST /mcp (Streamable HTTP JSON). SSE streaming is not required." }));
				return;
			}
			if (!authorized(headers, config.secret)) {
				respond(socket, 401, JSON.stringify({ error: "Unauthorized: send 'Authorization: Bearer <token>'. Copy the token from Blockbench ▸ Settings ▸ General ▸ MCP Access Token." }));
				return;
			}
			if (!/^application\/json\s*(;|$)/i.test(headers["content-type"] ?? "")) {
				respond(socket, 415, JSON.stringify({ error: "Content-Type must be application/json." }));
				return;
			}
			let parsed;
			try {
				parsed = JSON.parse(body || "{}");
			} catch {
				respond(socket, 400, JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32700,
						message: "Parse error"
					}
				}));
				return;
			}
			try {
				const result = await handleMcp(parsed);
				const extra = {};
				if (result.sessionId) extra["Mcp-Session-Id"] = result.sessionId;
				respond(socket, result.status, result.body, extra);
			} catch (err) {
				respond(socket, 500, JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32603,
						message: err instanceof Error ? err.message : String(err)
					}
				}));
			}
		};
		const server = net.createServer((socket) => {
			let buffer = new Uint8Array(0);
			let headerEnd = -1;
			let method = "GET";
			let path = "/";
			let contentLength = 0;
			let tooLarge = false;
			const headers = {};
			socket.on("data", (chunk) => {
				const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
				const merged = new Uint8Array(buffer.length + bytes.length);
				merged.set(buffer, 0);
				merged.set(bytes, buffer.length);
				buffer = merged;
				if (buffer.length > MAX_BODY) {
					tooLarge = true;
					respond(socket, 413, JSON.stringify({ error: "Request body over 8MB." }));
					return;
				}
				if (headerEnd === -1) {
					const text = new TextDecoder().decode(buffer.subarray(0, Math.min(buffer.length, 8192)));
					const index = text.indexOf("\r\n\r\n");
					if (index === -1) return;
					headerEnd = new TextEncoder().encode(text.slice(0, index)).length + 4;
					const lines = text.slice(0, index).split("\r\n");
					const [first = "GET / HTTP/1.1"] = lines;
					const parts = first.split(" ");
					method = parts[0] ?? "GET";
					path = parts[1] ?? "/";
					for (const line of lines.slice(1)) {
						const colon = line.indexOf(":");
						if (colon <= 0) continue;
						const key = line.slice(0, colon).trim().toLowerCase();
						const value = line.slice(colon + 1).trim();
						headers[key] = value;
						if (key === "content-length") contentLength = Number(value) || 0;
					}
				}
				if (tooLarge || headerEnd === -1) return;
				if (/chunked/i.test(headers["transfer-encoding"] ?? "")) {
					respond(socket, 411, JSON.stringify({ error: "Chunked request bodies are not supported. Send Content-Length with the JSON body." }));
					return;
				}
				if (buffer.length < headerEnd + contentLength) {
					socket.setTimeout(12e4, () => socket.destroy());
					return;
				}
				const body = new TextDecoder().decode(buffer.subarray(headerEnd, headerEnd + contentLength));
				const busyTimer = setTimeout(() => {
					respond(socket, 503, JSON.stringify({ error: `Blockbench did not answer within ${BUSY_TIMEOUT_MS / 1e3}s. It is probably showing a modal dialog (network permission, file dialog, unsaved-changes prompt) that blocks the renderer thread. Dismiss it in Blockbench and retry.` }));
				}, BUSY_TIMEOUT_MS);
				onRequest(method, path, headers, body, socket).catch(() => {
					respond(socket, 500, JSON.stringify({ error: "Internal error" }));
				}).finally(() => clearTimeout(busyTimer));
			});
			socket.on("error", () => {
				try {
					socket.destroy();
				} catch {}
			});
			socket.setTimeout(3e5, () => socket.destroy());
		});
		server.on("error", (err) => {
			listening = false;
			toast(`MCP server error: ${err?.message ?? "unknown"}`, 5e3);
		});
		server.listen(config.port, "127.0.0.1", () => {
			listening = true;
			toast(`Blockbench MCP ready → http://127.0.0.1:${config.port}/mcp`, 4e3);
		});
		return handle;
	}
	//#endregion
	//#region src/main.ts
	let server = null;
	let loadGeneration = 0;
	function startServer() {
		if (server?.running()) {
			toast(`MCP already running on port ${server.port}`, 2e3);
			return;
		}
		server?.stop();
		const config = readConfig();
		try {
			server = startHttpServer(config);
		} catch (err) {
			server = null;
			toast(`MCP start failed: ${err.message}`, 6e3);
		}
	}
	function stopServer() {
		server?.stop();
		server = null;
		toast("MCP server stopped", 2e3);
	}
	function clientConfigSnippet() {
		const config = readConfig();
		return JSON.stringify({
			url: `http://127.0.0.1:${config.port}/mcp`,
			headers: { Authorization: `Bearer ${config.secret}` }
		}, null, 2);
	}
	function statusReport() {
		const config = readConfig();
		const lines = [
			`Blockbench MCP ${PLUGIN_VERSION}`,
			server?.running() ? `RUNNING  http://127.0.0.1:${server.port}/mcp` : "STOPPED",
			`Tools available: ${registeredToolNames().length}`,
			`Access token: ${config.secret}`,
			"",
			"Point your MCP client at:",
			clientConfigSnippet(),
			"",
			"stdio-only clients: run `node gateway/index.mjs` with BBMCP_TOKEN set to the token above."
		];
		try {
			if (typeof Dialog === "function") {
				new Dialog({
					id: "bbmcp_status",
					title: "Blockbench MCP status",
					lines
				}).show();
				return;
			}
		} catch {}
		for (const line of lines) console.log(line);
		toast("MCP status written to the console", 3e3);
	}
	function registerActions() {
		const actions = [
			{
				id: "bbmcp_start",
				name: "Start MCP Server",
				icon: "play_arrow",
				click: startServer
			},
			{
				id: "bbmcp_stop",
				name: "Stop MCP Server",
				icon: "stop",
				click: stopServer
			},
			{
				id: "bbmcp_status",
				name: "MCP Server Status / Token",
				icon: "info",
				click: statusReport
			}
		];
		for (const spec of actions) try {
			const action = new Action(spec.id, {
				name: spec.name,
				description: spec.name,
				icon: spec.icon,
				category: "tools",
				click: spec.click
			});
			const menu = globalThis.MenuBar?.menus?.tools;
			if (menu?.addAction) menu.addAction(action);
			else globalThis.BarItems?.[spec.id] && (globalThis.BarItems[spec.id] = action);
		} catch {
			try {
				globalThis.BarItems?.[spec.id] === void 0 && (globalThis.BarItems[spec.id] = new Action(spec.id, {
					name: spec.name,
					icon: spec.icon,
					click: spec.click
				}));
			} catch {}
		}
	}
	Plugin.register("blockbench_mcp", {
		title: "Blockbench MCP",
		author: "blockbench-mcp-pro",
		description: "In-process Model Context Protocol server for Blockbench: modeling, procedural detail, texturing, animation, quality gates, human review and reference matching. Point any MCP client at http://127.0.0.1:<port>/mcp.",
		icon: "smart_toy",
		version: PLUGIN_VERSION,
		variant: "desktop",
		min_version: MIN_BLOCKBENCH_VERSION,
		onload() {
			loadGeneration += 1;
			const generation = loadGeneration;
			registerSettings();
			registerActions();
			const config = readConfig();
			toast(`Blockbench MCP ${PLUGIN_VERSION} loaded — ${registeredToolNames().length} tools`, 3e3);
			setTimeout(() => {
				if (generation !== loadGeneration) return;
				if (config.autostart) startServer();
				else toast("MCP not started. Use Tools ▸ Start MCP Server.", 4e3);
			}, 150);
		},
		onunload() {
			loadGeneration += 1;
			stopServer();
			session.scopedDirectory = null;
			session.pending.clear();
		},
		oninstall() {
			setTimeout(() => {
				statusReport();
				toast("MCP: allow network access when prompted, then Tools ▸ Start MCP Server", 8e3);
			}, 500);
		}
	});
	//#endregion
	exports.clientConfigSnippet = clientConfigSnippet;
	return exports;
})({});
