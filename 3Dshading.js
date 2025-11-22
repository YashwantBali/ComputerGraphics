// 3D Shading
// Assignment - 2

var gl;
var canvas;

// Buffers
var cubeBuf;
var cubeIndexBuf;
var cubeNormalBuf;
var spBuf;
var spIndexBuf;
var spNormalBuf;

// Geometry data
var spVerts = [];
var spNormals = [];
var spIndicies = [];

// Attribute / uniform locations
var aPositionLocation;
var aNormalLocation;
var uPMatrixLocation;
var uMMatrixLocation;
var uVMatrixLocation;
var normalMatrixLocation;

// Transformation matrices
var vMatrix = mat4.create();
var mMatrix = mat4.create();
var pMatrix = mat4.create();
var uNormalMatrix = mat3.create();
var matrixStack = [];

// Light and material settings
var lightPosition = [5, 4, 4];
var ambientColor = [1, 1, 1];
var diffuseColor = [1.0, 1.0, 1.0];
var specularColor = [1.0, 1.0, 1.0];

// Camera / viewing parameters
var eyePos = [0.0, 0.0, 2.0];
var COI = [0.0, 0.0, 0.0];
var viewUp = [0.0, 1.0, 0.0];

// Interaction / rotation
var degree0 = 0.0;
var degree1 = 0.0;
var degree2 = 0.0;
var degree3 = 0.0;
var degree4 = 0.0;
var degree5 = 0.0;
var prevMouseX = 0.0;
var prevMouseY = 0.0;

// Scene state
var scene = 0;

// Flat Shading
const flatVertexShader = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat4 uMMatrix;

out vec3 vPosEyeSpace;
out mat4 viewMatrix;

void main() {
    mat4 mvp = uPMatrix * uVMatrix * uMMatrix;
    gl_Position = mvp * vec4(aPosition, 1.0);

    vPosEyeSpace = (uVMatrix * uMMatrix * vec4(aPosition, 1.0)).xyz;
    viewMatrix   = uVMatrix;
}`;

const flatFragShader = `#version 300 es
precision mediump float;

in vec3 vPosEyeSpace;
in mat4 viewMatrix;

uniform vec3 uLightPosition;
uniform vec3 uAmbientColor;
uniform vec3 uDiffuseColor;
uniform vec3 uSpecularColor;

out vec4 fragColor;

void main() {
    // compute geometric normal from derivatives
    vec3 normal = normalize(cross(dFdx(vPosEyeSpace), dFdy(vPosEyeSpace)));

    vec3 L = normalize(uLightPosition - vPosEyeSpace);
    vec3 V = normalize(-vPosEyeSpace);
    vec3 R = normalize(reflect(-L, normal));

    float amb = 0.15;
    float diff = max(dot(L, normal), 0.0);
    float spec = pow(max(dot(R, V), 0.0), 32.0);

    vec3 color = uAmbientColor * amb +
                 uDiffuseColor * diff +
                 uSpecularColor * spec;

    fragColor = vec4(color, 1.0);
}`;

// Gouraud Shading
const perVertVertexShader = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat4 uMMatrix;

uniform vec3 uLightPosition;
uniform vec3 uAmbientColor;
uniform vec3 uDiffuseColor;
uniform vec3 uSpecularColor;

out vec3 fColor;

void main() {
    // position in eye coordinates
    vec3 eyePos = (uVMatrix * uMMatrix * vec4(aPosition, 1.0)).xyz;

    // transform the normal into eye coordinates
    mat3 normalMat = transpose(inverse(mat3(uVMatrix * uMMatrix)));
    vec3 eyeNormal = normalize(normalMat * aNormal);

    // vectors for lighting model
    vec3 L = normalize(uLightPosition - eyePos);
    vec3 V = normalize(-eyePos);
    vec3 R = reflect(-L, eyeNormal);

    // lighting contributions
    float amb = 0.15;
    float diff = max(dot(eyeNormal, L), 0.0);
    float spec = pow(max(dot(R, V), 0.0), 32.0);

    fColor = uAmbientColor * amb +
             uDiffuseColor * diff +
             uSpecularColor * spec;

    // clip-space position
    gl_Position = uPMatrix * uVMatrix * uMMatrix * vec4(aPosition, 1.0);
}`;

const perVertFragShader = `#version 300 es
precision mediump float;

in vec3 fColor;
out vec4 fragColor;

void main() {
    fragColor = vec4(fColor, 1.0);
}`;

// Phong Shading
const perFragVertexShader = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat4 uMMatrix;
uniform vec3 uLightPosition;

out vec3 vEyePos;
out vec3 vNormal;
out vec3 vLightDir;
out vec3 vViewDir;

void main() {
    // position in eye coordinates
    vEyePos = (uVMatrix * uMMatrix * vec4(aPosition, 1.0)).xyz;

    // normal in eye coordinates
    mat3 normalMat = mat3(uVMatrix * uMMatrix);
    vNormal = normalize(normalMat * aNormal);

    // lighting vectors
    vLightDir = normalize(uLightPosition - vEyePos);
    vViewDir  = normalize(-vEyePos);

    // clip-space output
    gl_Position = uPMatrix * uVMatrix * uMMatrix * vec4(aPosition, 1.0);
}`;

const perFragFragShader = `#version 300 es
precision mediump float;

in vec3 vNormal;
in vec3 vLightDir;
in vec3 vViewDir;
in vec3 vEyePos;

uniform vec3 uAmbientColor;
uniform vec3 uDiffuseColor;
uniform vec3 uSpecularColor;

out vec4 fragColor;

void main() {
    // normalize inputs
    vec3 N = normalize(vNormal);
    vec3 L = normalize(vLightDir);
    vec3 V = normalize(vViewDir);

    // reflection vector
    vec3 R = reflect(-L, N);

    // lighting model
    float amb = 0.15;
    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(R, V), 0.0), 32.0);

    vec3 color = uAmbientColor * amb +
                 uDiffuseColor * diff +
                 uSpecularColor * spec;

    fragColor = vec4(color, 1.0);
}`;


function vertexShaderSetup(src) {
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vShader, src);
    gl.compileShader(vShader);

    if (gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
        return vShader;
    } else {
        alert(gl.getShaderInfoLog(vShader));
        return null;
    }
}

function fragmentShaderSetup(src) {
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, src);
    gl.compileShader(fShader);

    if (gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
        return fShader;
    } else {
        alert(gl.getShaderInfoLog(fShader));
        return null;
    }
}

function initShaders(vCode, fCode) {
    const program = gl.createProgram();
    const vShader = vertexShaderSetup(vCode);
    const fShader = fragmentShaderSetup(fCode);

    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getShaderInfoLog(vShader));
        console.error(gl.getShaderInfoLog(fShader));
    }

    gl.useProgram(program);
    return program;
}

function initGL(canvas) {
    try {
        gl = canvas.getContext("webgl2");
        if (gl) {
            gl.viewportWidth = canvas.width;
            gl.viewportHeight = canvas.height;
        }
    } catch (e) {
        // ignore errors, handled below
    }
    if (!gl) {
        alert("WebGL initialization failed");
    }
}

function degToRad(deg) {
    return (Math.PI / 180) * deg;
}

function pushMatrix(stack, mat) {
    var snapshot = mat4.create(mat);
    stack.push(snapshot);
}

function popMatrix(stack) {
    if (stack.length === 0) {
        console.log("stack has no matrix to pop!");
        return;
    }
    return stack.pop();
}

function initSphere(slices, stacks, r) {
    let angleLat, angleLong;

    // bottom pole
    for (let s = 0; s < slices; s++) {
        spVerts.push(0, -r, 0);
        spNormals.push(0, -1, 0);
    }

    // middle stacks
    for (let t = 1; t < stacks - 1; t++) {
        angleLat = (2 * Math.PI * t) / slices - Math.PI / 2;

        for (let s = 0; s < slices; s++) {
            angleLong = (2 * Math.PI * s) / slices;

            let x = r * Math.cos(angleLat) * Math.cos(angleLong);
            let y = r * Math.sin(angleLat);
            let z = r * Math.cos(angleLat) * Math.sin(angleLong);

            spVerts.push(x, y, z);
            spNormals.push(
                Math.cos(angleLat) * Math.cos(angleLong),
                Math.sin(angleLat),
                Math.cos(angleLat) * Math.sin(angleLong)
            );
        }
    }

    // top pole
    for (let s = 0; s < slices; s++) {
        spVerts.push(0, r, 0);
        spNormals.push(0, 1, 0);
    }

    // indices
    for (let t = 0; t < stacks - 1; t++) {
        for (let s = 0; s <= slices; s++) {
            let cur = s % slices;
            let nxt = (s + 1) % slices;

            let a = (t + 1) * slices + cur;
            let b = t * slices + cur;
            let c = t * slices + nxt;
            let d = (t + 1) * slices + nxt;

            spIndicies.push(a, b, c, a, c, d);
        }
    }
}

function initSphereBuffer() {
    const totalSlices = 30;
    const totalStacks = totalSlices / 2 + 1;
    const rad = 0.5;

    initSphere(totalSlices, totalStacks, rad);

    // Vertex positions
    spBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spVerts), gl.STATIC_DRAW);
    spBuf.itemSize = 3;
    spBuf.numItems = totalSlices * totalStacks;

    // Normals
    spNormalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spNormals), gl.STATIC_DRAW);
    spNormalBuf.itemSize = 3;
    spNormalBuf.numItems = totalSlices * totalStacks;

    // Indices
    spIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint32Array(spIndicies),
        gl.STATIC_DRAW
    );
    spIndexBuf.itemSize = 1;
    spIndexBuf.numItems = (totalStacks - 1) * 6 * (totalSlices + 1);
}

function drawSphere() {
    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.vertexAttribPointer(
        aPositionLocation,
        spBuf.itemSize,
        gl.FLOAT,
        false,
        0,
        0
    );

    // Normal attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.vertexAttribPointer(
        aNormalLocation,
        spNormalBuf.itemSize,
        gl.FLOAT,
        false,
        0,
        0
    );

    // Index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

    // Transformation + lighting uniforms
    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    gl.uniform3fv(uLightPositionLocation,  lightPosition);
    gl.uniform3fv(uAmbientColorLocation,   ambientColor);
    gl.uniform3fv(uDiffuseColorLocation,   diffuseColor);
    gl.uniform3fv(uSpecularColorLocation,  specularColor);

    // Draw call
    gl.drawElements(
        gl.TRIANGLES,
        spIndexBuf.numItems,
        gl.UNSIGNED_INT,
        0
    );
}

function initCubeBuffer() {
    const verts = [
        -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
        -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
        -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
        -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
         0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
        -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,  -0.5, -0.5,  0.5
    ];
    cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    cubeBuf.itemSize = 3;
    cubeBuf.numItems = verts.length / 3;

    const norms = [
         0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,
         0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,
         0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,
         0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,
         1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,
        -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0
    ];
    cubeNormalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norms), gl.STATIC_DRAW);
    cubeNormalBuf.itemSize = 3;
    cubeNormalBuf.numItems = norms.length / 3;

    const inds = [
         0,  1,  2,   0,  2,  3,   // face 1
         4,  5,  6,   4,  6,  7,   // face 2
         8,  9, 10,   8, 10, 11,   // face 3
        12, 13, 14,  12, 14, 15,   // face 4
        16, 17, 18,  16, 18, 19,   // face 5
        20, 21, 22,  20, 22, 23    // face 6
    ];
    cubeIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(inds), gl.STATIC_DRAW);
    cubeIndexBuf.itemSize = 1;
    cubeIndexBuf.numItems = inds.length;
}

function drawCube() {
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.vertexAttribPointer(aPositionLocation, cubeBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
    gl.vertexAttribPointer(aNormalLocation, cubeNormalBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuf);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);

    gl.uniform3fv(uLightPositionLocation, lightPosition);
    gl.uniform3fv(uAmbientColorLocation, ambientColor);
    gl.uniform3fv(uDiffuseColorLocation, diffuseColor);
    gl.uniform3fv(uSpecularColorLocation, specularColor);

    gl.drawElements(gl.TRIANGLES, cubeIndexBuf.numItems, gl.UNSIGNED_SHORT, 0);
}

function drawScene1() {
    mat4.identity(vMatrix);
    vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

    mat4.identity(pMatrix);
    mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

    mat4.identity(mMatrix);
    mat4.identity(uNormalMatrix);

    mMatrix = mat4.rotate(mMatrix, degToRad(degree0), [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, degToRad(degree1), [1, 0, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.5, [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.2, [1, 0, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.1, [0, 0, 1]);

    mMatrix = mat4.scale(mMatrix, [1.1, 1.1, 1.1]);
    mMatrix = mat4.translate(mMatrix, [0, -0.1, 0]);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0, 0.5, 0]);
    mMatrix = mat4.scale(mMatrix, [0.5, 0.5, 0.5]);
    diffuseColor = [0.0, 0.35, 0.6];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.0, -0.125, 0.0]);
    mMatrix = mat4.scale(mMatrix, [0.45, 0.76, 0.5]);
    diffuseColor = [0.68, 0.68, 0.49];
    drawCube();
    mMatrix = popMatrix(matrixStack);
}


function drawScene2() {
    mat4.identity(vMatrix);
    vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

    mat4.identity(pMatrix);
    mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

    mat4.identity(mMatrix);
    mMatrix = mat4.rotate(mMatrix, degToRad(degree2), [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, degToRad(degree3), [1, 0, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.05, [0, 1, 0]);
    mMatrix = mat4.scale(mMatrix, [0.95, 0.95, 0.95]);

    // main base sphere
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.0, -0.45, 0.1]);
    mMatrix = mat4.scale(mMatrix, [0.7, 0.7, 0.7]);
    diffuseColor = [0.73, 0.73, 0.73];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // first cube
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.36, -0.05, 0.1]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.4, 0.4]);
    mMatrix = mat4.rotate(mMatrix, 0.5, [1, 0, 0]);
    mMatrix = mat4.rotate(mMatrix, -0.45, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, -0.5, [0, 1, 0]);
    diffuseColor = [0.0, 0.52, 0.0];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // second sphere
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.18, 0.24, 0.25]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.4, 0.4]);
    diffuseColor = [0.73, 0.73, 0.73];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // second cube
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.095, 0.41, 0.3]);
    mMatrix = mat4.scale(mMatrix, [0.25, 0.25, 0.25]);
    mMatrix = mat4.rotate(mMatrix, 0.5, [1, 0, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.5, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, 0.2, [0, 1, 0]);
    diffuseColor = [0.0, 0.52, 0.0];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // top sphere
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.02, 0.6, 0.4]);
    mMatrix = mat4.scale(mMatrix, [0.25, 0.25, 0.25]);
    diffuseColor = [0.73, 0.73, 0.73];
    drawSphere();
    mMatrix = popMatrix(matrixStack);
}

function drawScene3() {
    mat4.identity(vMatrix);
    vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

    mat4.identity(pMatrix);
    mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

    mat4.identity(mMatrix);
    mMatrix = mat4.rotate(mMatrix, degToRad(degree4), [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, degToRad(degree5), [1, 0, 0]);

    // Sphere 1
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0, -0.6, 0.1]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.4, 0.4]);
    diffuseColor = [0.0, 0.69, 0.14];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // Cube 1
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.01, -0.38, 0.1]);
    mMatrix = mat4.rotate(mMatrix, Math.PI / 4, [1, 1, 1]);
    mMatrix = mat4.rotate(mMatrix, -0.6, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, 0.1, [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, -0.1, [1, 0, 0]);
    mMatrix = mat4.scale(mMatrix, [1.35, 0.03, 0.25]);
    diffuseColor = [0.93, 0.04, 0.07];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // Sphere 2
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.35, -0.21, 0.4]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
    diffuseColor = [0.26, 0.27, 0.53];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // Sphere 3
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.35, -0.21, -0.2]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
    diffuseColor = [0.1, 0.32, 0.3];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // Cube 2
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.35, -0.07, 0.45]);
    mMatrix = mat4.rotate(mMatrix, 3 * Math.PI / 4, [1, 1, 1]);
    mMatrix = mat4.rotate(mMatrix, -1.45, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, 0.6, [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.1, [1, 0, 0]);
    mMatrix = mat4.scale(mMatrix, [0.6, 0.03, 0.3]);
    diffuseColor = [0.7, 0.6, 0.0];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // Cube 3
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.35, -0.07, -0.2]);
    mMatrix = mat4.rotate(mMatrix, 3 * Math.PI / 4, [1, 1, 1]);
    mMatrix = mat4.rotate(mMatrix, -1.45, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, 0.6, [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, 0.1, [1, 0, 0]);
    mMatrix = mat4.scale(mMatrix, [0.6, 0.03, 0.3]);
    diffuseColor = [0.18, 0.62, 0.0];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // Sphere 4
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.35, 0.1, 0.4]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
    diffuseColor = [0.69, 0.0, 0.69];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // Sphere 5
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.35, 0.1, -0.2]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
    diffuseColor = [0.65, 0.47, 0.12];
    drawSphere();
    mMatrix = popMatrix(matrixStack);

    // Cube 4
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.01, 0.265, 0.1]);
    mMatrix = mat4.rotate(mMatrix, Math.PI / 4, [1, 1, 1]);
    mMatrix = mat4.rotate(mMatrix, -0.6, [0, 0, 1]);
    mMatrix = mat4.rotate(mMatrix, 0.12, [0, 1, 0]);
    mMatrix = mat4.rotate(mMatrix, -0.25, [1, 0, 0]);
    mMatrix = mat4.scale(mMatrix, [1.35, 0.03, 0.25]);
    diffuseColor = [0.93, 0.04, 0.07];
    drawCube();
    mMatrix = popMatrix(matrixStack);

    // Sphere 6
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.0, 0.48, 0.1]);
    mMatrix = mat4.scale(mMatrix, [0.4, 0.4, 0.4]);
    diffuseColor = [0.54, 0.54, 0.67];
    drawSphere();
    mMatrix = popMatrix(matrixStack);
};

function drawScene() {

    gl.enable(gl.SCISSOR_TEST);

    // Flat shading viewport
    shaderProgram = flatShaderProgram;
    gl.useProgram(shaderProgram);

    gl.viewport(0, 0, 400, 400);
    gl.scissor(0, 0, 400, 400);

    gl.clearColor(0.85, 0.85, 0.95, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    aPositionLocation        = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation          = gl.getAttribLocation(shaderProgram, "aNormal"); 
    uMMatrixLocation         = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uVMatrixLocation         = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uPMatrixLocation         = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uLightPositionLocation   = gl.getUniformLocation(shaderProgram, "uLightPosition");
    uAmbientColorLocation    = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    uDiffuseColorLocation    = gl.getUniformLocation(shaderProgram, "uDiffuseColor");
    uSpecularColorLocation   = gl.getUniformLocation(shaderProgram, "uSpecularColor");

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);

    initSphereBuffer();
    initCubeBuffer();
    gl.enable(gl.DEPTH_TEST);
    drawScene1();


    // Per-vertex lighting viewport
    shaderProgram = perVertShaderProgram;
    gl.useProgram(shaderProgram);

    gl.viewport(400, 0, 400, 400);
    gl.scissor(400, 0, 400, 400);

    gl.clearColor(0.95, 0.85, 0.85, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    aPositionLocation        = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation          = gl.getAttribLocation(shaderProgram, "aNormal"); 
    uMMatrixLocation         = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uVMatrixLocation         = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uPMatrixLocation         = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uLightPositionLocation   = gl.getUniformLocation(shaderProgram, "uLightPosition");
    uAmbientColorLocation    = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    uDiffuseColorLocation    = gl.getUniformLocation(shaderProgram, "uDiffuseColor");
    uSpecularColorLocation   = gl.getUniformLocation(shaderProgram, "uSpecularColor");

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);

    initSphereBuffer();
    initCubeBuffer();
    gl.enable(gl.DEPTH_TEST);
    drawScene2();

    // Per-fragment lighting viewport
    shaderProgram = perFragShaderProgram;
    gl.useProgram(shaderProgram);

    gl.viewport(800, 0, 400, 400);
    gl.scissor(800, 0, 400, 400);

    gl.clearColor(0.85, 0.95, 0.85, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    aPositionLocation        = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation          = gl.getAttribLocation(shaderProgram, "aNormal"); 
    uMMatrixLocation         = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uVMatrixLocation         = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uPMatrixLocation         = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uLightPositionLocation   = gl.getUniformLocation(shaderProgram, "uLightPosition");
    uAmbientColorLocation    = gl.getUniformLocation(shaderProgram, "uAmbientColor");
    uDiffuseColorLocation    = gl.getUniformLocation(shaderProgram, "uDiffuseColor");
    uSpecularColorLocation   = gl.getUniformLocation(shaderProgram, "uSpecularColor");

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);

    initSphereBuffer();
    initCubeBuffer();
    gl.enable(gl.DEPTH_TEST);
    drawScene3();
}

function onMouseDown(e) {
    document.addEventListener("mousemove", onMouseMove, false);
    document.addEventListener("mouseup", onMouseUp, false);
    document.addEventListener("mouseout", onMouseOut, false);

    if (e.layerX >= 0 && e.layerX <= canvas.width &&
        e.layerY >= 0 && e.layerY <= canvas.height) {

        prevMouseX = e.clientX;
        prevMouseY = canvas.height - e.clientY;

        let insideY = prevMouseY >= -100 && prevMouseY <= 300;

        if (prevMouseX >= 50 && prevMouseX <= 450 && insideY) {
            scene = 1;
        } else if (prevMouseX >= 450 && prevMouseX <= 850 && insideY) {
            scene = 2;
        } else if (prevMouseX >= 850 && prevMouseX <= 1250 && insideY) {
            scene = 3;
        }
    }
}

function onMouseMove(e) {
    let currX = e.clientX;
    let dx = currX - prevMouseX;
    prevMouseX = currX;

    let currY = canvas.height - e.clientY;
    let dy = currY - prevMouseY;
    prevMouseY = currY;

    console.log(currX, currY);

    let insideY = currY >= -100 && currY <= 300;

    if (currX >= 50 && currX <= 450 && insideY && scene === 1) {
        degree0 += dx / 5;
        degree1 -= dy / 5;
    } else if (currX >= 450 && currX <= 850 && insideY && scene === 2) {
        degree2 += dx / 5;
        degree3 -= dy / 5;
    } else if (currX >= 850 && currX <= 1250 && insideY && scene === 3) {
        degree4 += dx / 5;
        degree5 -= dy / 5;
    }

    drawScene();
}

function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove, false);
    document.removeEventListener("mouseup", onMouseUp, false);
    document.removeEventListener("mouseout", onMouseOut, false);
}

function onMouseOut() {
    document.removeEventListener("mousemove", onMouseMove, false);
    document.removeEventListener("mouseup", onMouseUp, false);
    document.removeEventListener("mouseout", onMouseOut, false);
}

function webGLStart() {
    canvas = document.getElementById("assn2");
    document.addEventListener("mousedown", onMouseDown, false);

    const lightSlider = document.getElementById("light-slider");
    let lx = parseFloat(lightSlider.value);

    lightSlider.addEventListener("input", (e) => {
        lx = parseFloat(e.target.value);
        lightPosition = [lx, 3.0, 4.0];
        drawScene();
    });

    const cameraSlider = document.getElementById("camera-slider");
    let cz = parseFloat(cameraSlider.value);

    cameraSlider.addEventListener("input", (e) => {
        cz = parseFloat(e.target.value);
        eyePos = [0.0, 0.0, cz];
        drawScene();
    });

    initGL(canvas);

    flatShaderProgram   = initShaders(flatVertexShader, flatFragShader);
    perVertShaderProgram = initShaders(perVertVertexShader, perVertFragShader);
    perFragShaderProgram = initShaders(perFragVertexShader, perFragFragShader);

    drawScene();
}