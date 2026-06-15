var renderer, camera, scene, controls;
var container, textureLoader;
var envTexture = null;
var currentColor = null;
var defaultView;
var texScale = 1;
var texRot = 0;
var GarmentFile;

var GARMENTS = {
	hoodie: 'Data/Garment/Hoodie/Hoodie',
	slacks: 'Data/Garment/HoodieSlacks/HoodieSlacks',
	jumper: 'Data/Garment/Jumper/Jumper'
};
var TEXTURES = {
	'1': 'Data/Texture/Texture (1).jpg', '2': 'Data/Texture/Texture (2).jpg',
	'3': 'Data/Texture/Texture (3).jpg', '4': 'Data/Texture/Texture (4).jpg',
	'5': 'Data/Texture/Texture (5).jpg'
};
var BACKS = {
	'1': 'Data/Background/Background 1.jpg', '2': 'Data/Background/Background 2.jpg',
	'3': 'Data/Background/Background 3.jpg'
};
var stateGarment = 'hoodie', stateTex = null, stateBg = '1';

init();

function init()
{
	container = document.getElementById('view');

	renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setClearColor(0xcccccc, 1.0);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.gammaOutput = true;
	renderer.gammaFactor = 2.2;
	container.appendChild(renderer.domElement);

	camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
	camera.position.set(0, 0, 2);

	scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, 0.7));

	var spot = new THREE.SpotLight(0xffffff, 0.5);
	spot.position.set(0, 2, 1);
	spot.castShadow = true;
	spot.shadow.mapSize.width = 1024;
	spot.shadow.mapSize.height = 1024;
	scene.add(spot);

	var spot2 = new THREE.SpotLight(0xffffff, 0.5);
	spot2.position.set(0, 2, -1);
	scene.add(spot2);
	scene.add(camera);

	textureLoader = new THREE.TextureLoader();

	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.15;
	controls.screenSpacePanning = true;
	controls.rotateSpeed = 0.3;
	controls.zoomSpeed = 0.8;
	controls.panSpeed = 0.3;

	renderer.domElement.addEventListener('dblclick', resetView);

	container.addEventListener('dragover', function (e) { e.preventDefault(); container.classList.add('dragover'); });
	container.addEventListener('dragleave', function () { container.classList.remove('dragover'); });
	container.addEventListener('drop', onDropFile);

	window.addEventListener('resize', resize);
	resize();

	applyStateFromURL();
	Render();
}

function resize()
{
	var w = container.clientWidth, h = container.clientHeight;
	if (w === 0 || h === 0) return;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}

function selectGarment(key) { resetMaterialState(); stateGarment = key; LoadGarment(GARMENTS[key]); }
function selectTexture(key) { stateTex = String(key); ChangeTexture(TEXTURES[stateTex]); }
function selectBackground(key) { stateBg = String(key); LoadBackground(BACKS[stateBg]); }

function clearModel()
{
	var m = scene.getObjectByName('model');
	if (m) { disposeObject(m); scene.remove(m); }
	var s = scene.getObjectByName('stage');
	if (s) scene.remove(s);
}

function addModelToScene(object)
{
	object.name = 'model';
	object.traverse(function (c) {
		if (!c.isMesh) return;
		c.castShadow = true;
		if (c.material) {
			c.material = Array.isArray(c.material)
				? c.material.map(function (m) { return m.clone(); })
				: c.material.clone();
			(Array.isArray(c.material) ? c.material : [c.material]).forEach(function (m) { m.side = THREE.DoubleSide; });
		}
		if (c.geometry && c.geometry.attributes.uv) {
			c.userData.baseUV = Float32Array.from(c.geometry.attributes.uv.array);
		}
	});
	scene.add(object);

	var box = new THREE.Box3().setFromObject(object);
	makeStage(box);
	if (envTexture) applyEnvMap();
	if (stateTex) ChangeTexture(TEXTURES[stateTex]);
	if (currentColor !== null) applyColor(currentColor);
	applyUVTransform();
	frameObject(box);
	renderer.shadowMap.needsUpdate = true;
	showProgress(false);
}

function makeStage(box)
{
	var c = box.getCenter(new THREE.Vector3());
	var s = box.getSize(new THREE.Vector3());
	var r = Math.max(s.x, s.z) * 0.75;
	if (!(r > 0)) r = 1;
	var plane = new THREE.Mesh(
		new THREE.CircleGeometry(r, 48),
		new THREE.MeshLambertMaterial({ color: 0x888888 }));
	plane.rotation.x = -0.5 * Math.PI;
	plane.position.set(c.x, box.min.y, c.z);
	plane.receiveShadow = true;
	plane.name = 'stage';
	scene.add(plane);
}

function frameObject(box)
{
	var center = box.getCenter(new THREE.Vector3());
	var size = box.getSize(new THREE.Vector3());
	var maxDim = Math.max(size.x, size.y, size.z);
	var dist = (maxDim / 2) / Math.tan(camera.fov * Math.PI / 360) * 1.4;

	controls.target.copy(center);
	camera.position.set(center.x, center.y, center.z + dist);
	controls.minDistance = dist * 0.2;
	controls.maxDistance = dist * 5;
	controls.update();

	defaultView = { pos: camera.position.clone(), target: controls.target.clone() };
}

function resetView()
{
	if (!defaultView) return;
	camera.position.copy(defaultView.pos);
	controls.target.copy(defaultView.target);
	controls.update();
}

function LoadGarment(garment)
{
	clearModel();
	showProgress(true, '불러오는 중...');
	GarmentFile = garment;
	var ml = new THREE.MTLLoader();
	ml.load(garment + '.mtl', function (materials) {
		materials.preload();
		var ol = new THREE.OBJLoader();
		ol.setMaterials(materials);
		ol.load(GarmentFile + '.obj', function (object) {
			object.scale.set(0.001, 0.001, 0.001);
			addModelToScene(object);
		}, onLoadProgress, onLoadError);
	}, undefined, onLoadError);
}

function onDropFile(e)
{
	e.preventDefault();
	container.classList.remove('dragover');
	if (e.dataTransfer.files.length) loadUserFiles(e.dataTransfer.files);
}

function onPickFile(input)
{
	if (input.files.length) loadUserFiles(input.files);
}

function loadUserFiles(fileList)
{
	var files = Array.prototype.slice.call(fileList);
	var urlMap = {}, lower = {};
	files.forEach(function (f) {
		var u = URL.createObjectURL(f);
		urlMap[f.name] = u;
		lower[f.name.toLowerCase()] = u;
	});

	function byExt(ext) {
		for (var i = 0; i < files.length; i++)
			if (files[i].name.toLowerCase().slice(-ext.length) === ext) return files[i];
		return null;
	}

	var glb = byExt('.glb') || byExt('.gltf');
	var fbx = byExt('.fbx');
	var obj = byExt('.obj');

	if (!glb && !fbx && !obj) {
		showProgress(true, '지원 형식: .glb / .gltf / .fbx / .obj');
		Object.keys(urlMap).forEach(function (k) { URL.revokeObjectURL(urlMap[k]); });
		return;
	}

	var manager = new THREE.LoadingManager();
	manager.setURLModifier(function (url) {
		var base = url.split('/').pop().split('\\').pop();
		return lower[base.toLowerCase()] || url;
	});
	manager.onLoad = function () {
		Object.keys(urlMap).forEach(function (k) { URL.revokeObjectURL(urlMap[k]); });
	};

	resetMaterialState();
	stateGarment = null;
	clearModel();

	if (glb) {
		showProgress(true, 'Loading ' + glb.name + ' ...');
		new THREE.GLTFLoader(manager).load(urlMap[glb.name],
			function (gltf) { addModelToScene(gltf.scene); }, onLoadProgress, onLoadError);
		return;
	}
	if (fbx) {
		showProgress(true, 'Loading ' + fbx.name + ' ...');
		new THREE.FBXLoader(manager).load(urlMap[fbx.name],
			function (object) { addModelToScene(object); }, onLoadProgress, onLoadError);
		return;
	}

	showProgress(true, 'Loading ' + obj.name + ' ...');
	var mtl = byExt('.mtl');
	var loadObj = function (materials) {
		var ol = new THREE.OBJLoader(manager);
		if (materials) { materials.preload(); ol.setMaterials(materials); }
		ol.load(urlMap[obj.name], function (object) { addModelToScene(object); }, onLoadProgress, onLoadError);
	};
	if (mtl) new THREE.MTLLoader(manager).load(urlMap[mtl.name], loadObj, undefined, function () { loadObj(null); });
	else loadObj(null);
}

function LoadBackground(back)
{
	textureLoader.load(back, function (texture) {
		scene.background = texture;
		envTexture = texture;
		envTexture.mapping = THREE.EquirectangularReflectionMapping;
		applyEnvMap();
	});
}

function applyEnvMap()
{
	eachGarmentMaterial(function (m) {
		m.envMap = envTexture;
		if ('reflectivity' in m) m.reflectivity = 0.05;
		if ('shininess' in m) m.shininess = 6;
		if (m.specular) m.specular.setHex(0x111111);
		if ('envMapIntensity' in m) m.envMapIntensity = 0.12;
		if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.85);
		if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.0);
		m.needsUpdate = true;
	});
}

function ChangeTexture(t)
{
	var texture = textureLoader.load(t);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	eachGarmentMaterial(function (m) { m.map = texture; m.needsUpdate = true; });
}

function ClearTexture()
{
	eachGarmentMaterial(function (m) { m.map = null; m.needsUpdate = true; });
}

function SetColor(hex)
{
	currentColor = new THREE.Color(hex);
	applyColor(currentColor);
}

function applyColor(color)
{
	eachGarmentMaterial(function (m) { if (m.color) m.color.copy(color); });
}

function ResetColor()
{
	currentColor = null;
	eachGarmentMaterial(function (m) { if (m.color) m.color.setRGB(1, 1, 1); });
	var inp = document.getElementById('colorPick'); if (inp) inp.value = '#ffffff';
}

function eachGarmentMaterial(fn)
{
	scene.traverse(function (obj) {
		if (obj.isMesh && obj.name !== 'stage' && obj.material) {
			(Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(fn);
		}
	});
}

function setTexScale(v)
{
	texScale = parseFloat(v) || 1;
	syncInput('scaleRange', 'scaleNum', texScale);
	applyUVTransform();
}

function setTexRot(v)
{
	texRot = parseFloat(v) || 0;
	syncInput('rotRange', 'rotNum', texRot);
	applyUVTransform();
}

function syncInput(rangeId, numId, val)
{
	var r = document.getElementById(rangeId), n = document.getElementById(numId);
	if (r) r.value = val;
	if (n) n.value = val;
}

function applyUVTransform()
{
	var a = texRot * Math.PI / 180, cc = Math.cos(a), ss = Math.sin(a), s = texScale;
	scene.traverse(function (obj) {
		if (!(obj.isMesh && obj.name !== 'stage' && obj.geometry)) return;
		var uv = obj.geometry.attributes.uv, base = obj.userData.baseUV;
		if (!uv || !base) return;
		for (var i = 0; i < uv.count; i++) {
			var u = base[i * 2] * s, v = base[i * 2 + 1] * s;
			uv.setXY(i, u * cc - v * ss, u * ss + v * cc);
		}
		uv.needsUpdate = true;
	});
}

function resetMaterialState()
{
	stateTex = null;
	currentColor = null;
	texScale = 1;
	texRot = 0;
	syncInput('scaleRange', 'scaleNum', 1);
	syncInput('rotRange', 'rotNum', 0);
	var cp = document.getElementById('colorPick'); if (cp) cp.value = '#ffffff';
}

function applyStateFromURL()
{
	var p = new URLSearchParams(location.search);
	stateBg = p.get('bg') || '1';
	stateGarment = p.get('g') || 'hoodie';
	if (!GARMENTS[stateGarment]) stateGarment = 'hoodie';
	stateTex = p.get('t');
	if (stateTex && !TEXTURES[stateTex]) stateTex = null;
	var c = p.get('c');
	if (c && /^[0-9a-fA-F]{6}$/.test(c)) {
		currentColor = new THREE.Color('#' + c);
		var inp = document.getElementById('colorPick');
		if (inp) inp.value = '#' + c;
	}
	selectBackground(stateBg);
	LoadGarment(GARMENTS[stateGarment]);
}

function ShareLink()
{
	if (!stateGarment) { showToast('업로드한 파일은 링크 공유가 안 됩니다 (번들 의상만)'); return; }
	var p = new URLSearchParams();
	p.set('g', stateGarment);
	if (stateTex) p.set('t', stateTex);
	p.set('bg', stateBg);
	if (currentColor) p.set('c', currentColor.getHexString());
	var url = location.origin + location.pathname + '?' + p.toString();
	history.replaceState(null, '', url);
	if (navigator.clipboard && navigator.clipboard.writeText)
		navigator.clipboard.writeText(url).then(function () { showToast('공유 링크가 복사되었습니다'); }, function () { showToast(url); });
	else showToast(url);
}

function OpenAR()
{
	var glb = { hoodie: 'Hoodie.glb', jumper: 'Jumper.glb' };
	var q = (stateGarment && glb[stateGarment]) ? ('?src=' + encodeURIComponent(glb[stateGarment])) : '';
	window.open('ar.html' + q, '_blank');
}

function SaveScreenshot()
{
	renderer.render(scene, camera);
	var a = document.createElement('a');
	a.href = renderer.domElement.toDataURL('image/png');
	a.download = 'garment_' + Date.now() + '.png';
	a.click();
}

function toggleMenu(btn)
{
	var menu = btn.parentElement;
	menu.classList.toggle('open');
	var all = document.querySelectorAll('.menu');
	for (var i = 0; i < all.length; i++) if (all[i] !== menu) all[i].classList.remove('open');
}

function showToast(msg)
{
	var t = document.getElementById('toast');
	if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
	t.textContent = msg; t.style.opacity = '1';
	clearTimeout(showToast._h);
	showToast._h = setTimeout(function () { t.style.opacity = '0'; }, 2200);
}

function showProgress(visible, label)
{
	var box = document.getElementById('progress');
	if (!box) return;
	box.style.display = visible ? 'block' : 'none';
	if (label) document.getElementById('progress-label').textContent = label;
	if (visible) setBar(0);
}

function setBar(p) { var b = document.getElementById('progress-bar'); if (b) b.style.width = p + '%'; }

function onLoadProgress(xhr)
{
	var lbl = document.getElementById('progress-label');
	if (xhr.lengthComputable && xhr.total > 0) {
		var pct = Math.round(xhr.loaded / xhr.total * 100);
		setBar(pct);
		lbl.textContent = 'Loading... ' + pct + '%  (' + (xhr.loaded / 1048576).toFixed(1) + ' MB)';
	} else {
		lbl.textContent = 'Loading... ' + (xhr.loaded / 1048576).toFixed(1) + ' MB';
	}
}

function onLoadError(err)
{
	showProgress(true, '불러오기 실패');
	console.error(err);
}

function disposeObject(obj)
{
	obj.traverse(function (c) {
		if (c.geometry) c.geometry.dispose();
		if (c.material) {
			(Array.isArray(c.material) ? c.material : [c.material]).forEach(function (m) {
				if (m.map) m.map.dispose();
				m.dispose();
			});
		}
	});
}

function Render()
{
	requestAnimationFrame(Render);
	controls.update();
	renderer.render(scene, camera);
}
