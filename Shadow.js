var gl;
var canvas;
var matrixStack = [];
var FBO;

var aPositionLocation;
var aNormalLocation;
var aTexCoordLocation; 

var uVMatrixLocation;
var uMMatrixLocation;
var uPMatrixLocation;
var uLMatrixLocation;

var uEyePosLocation;
var uLightPositionLocation;
var uLightColorLocation;
var uObjColorLocation;

var uTexture2DLocation;

var objVertexPositionBuffer;
var objVertexNormalBuffer;
var objVertexIndexBuffer;
var objVertexTextureBuffer;

var cubeBuf;
var cubeIndexBuf;
var cubeNormalBuf;
var cubeTexBuf;

var spBuf;
var spIndexBuf;
var spNormalBuf;
var spTexBuf;

var spVerts = [];
var spIndicies = [];
var spNormals = [];
var spTexCoords = [];

var dist = 3.0;
var lightz = 2.0;

var lightPosition = [2.0, 4.0, lightz];
var LightColor = [1.0, 1.0, 1.0, 1.0];
var eyePos = [0.0, 1.0, 3.0];
var COI = [0.0, 0.0, 0.0];
var viewUp = [0.0, 1.0, 0.0];
var degree = 0.0;
var move = 0;

var vMatrix = mat4.create();
var lMatrix = mat4.create();
var mMatrix = mat4.create();
var pMatrix = mat4.create();

var input_JSON = "./teapot.json";

var animation;
var angle = 0.0;
var depthTextureSize = 2048;
var depthTexture;
var work = false;

const vertexShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat4 uLMatrix;
uniform vec3 uLightPosition;

out vec3 PosEyeSpace;
out vec3 normalEyeSpace;
out vec3 EyeLightPos;
out vec4 shadowTexCoords;

void main() {
    mat4 projectionModelView = uPMatrix * uVMatrix * uMMatrix;
    gl_Position =  projectionModelView * vec4(aPosition, 1.0);

    PosEyeSpace = (uVMatrix * uMMatrix * vec4(aPosition, 1.0)).xyz;
    EyeLightPos = (uVMatrix * vec4(uLightPosition, 1.0)).xyz;
    normalEyeSpace = normalize(transpose(inverse(mat3(uVMatrix * uMMatrix))) * aNormal);

    mat4 TextureTransformMat = mat4(0.5, 0.0, 0.0, 0.0,
                                    0.0, 0.5, 0.0, 0.0,
                                    0.0, 0.0, 0.5, 0.0,
                                    0.5, 0.5, 0.5, 1.0);

    mat4 lightprojectionModelView = TextureTransformMat * uPMatrix * uLMatrix * uMMatrix;

    shadowTexCoords = (lightprojectionModelView * vec4(aPosition, 1.0));
}`;

const fragShaderCode = `#version 300 es
precision highp float;

in vec3 EyeLightPos;
in vec3 normalEyeSpace;
in vec3 PosEyeSpace;
in vec4 shadowTexCoords;

out vec4 fragColor;

uniform vec4 uLightColor;
uniform vec4 uobjColor;
uniform vec3 eyePos;
uniform sampler2D uTexture2D;


void main() {
    vec3 projectedTexCoords = shadowTexCoords.xyz / shadowTexCoords.w;

    float currentDepth = projectedTexCoords.z;

    float TexDepth = texture(uTexture2D, projectedTexCoords.xy).r;
    float shadow = (currentDepth - 0.0005) > TexDepth ? 0.1 : 1.0;

    vec3 L = normalize(EyeLightPos - PosEyeSpace);
    vec3 V = normalize(-PosEyeSpace);
    vec3 R = normalize(reflect(-L, normalEyeSpace));
    
    vec4 diffuse = uobjColor * max(dot(normalEyeSpace, L), 0.0);
    vec4 specular = uLightColor * pow(max(dot(R, V), 0.0), 40.0);

    fragColor = 0.4 * uobjColor + shadow * (diffuse + specular);
    fragColor.a = 1.0;
    //fragColor = vec4(vec3(shadow),1.0);
}`;

const vertexShadowShaderCode = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uMMatrix;
uniform mat4 uPMatrix;
uniform mat4 uVMatrix;
uniform mat4 uLMatrix;
uniform vec3 uLightPosition;

void main() {
    gl_Position =  uPMatrix * uLMatrix * uMMatrix * vec4(aPosition, 1.0);
    gl_PointSize = 1.0;
}`;

const fragShadowShaderCode = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec4 uLightColor;
uniform vec4 uobjColor;
uniform vec3 eyePos;
uniform sampler2D uTexture2D;

void main() {
    fragColor = uobjColor;
    //gl_FragDepth = gl_FragCoord.z;
}`;


function vertexShaderSetup(vertexShaderCode) {
    shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(shader, vertexShaderCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

function fragmentShaderSetup(fragShaderCode) {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, fragShaderCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

function initShaders(vertexShaderCode, fragShaderCode) {
    shaderProgram = gl.createProgram();

    var vertexShader = vertexShaderSetup(vertexShaderCode);
    var fragmentShader = fragmentShaderSetup(fragShaderCode);

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);

    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log(gl.getShaderInfoLog(vertexShader));
        console.log(gl.getShaderInfoLog(fragmentShader));
    }

    gl.useProgram(shaderProgram);

    return shaderProgram;
}

function initGL(canvas) {
    try {
        gl = canvas.getContext("webgl2"); 
        gl.viewportWidth = canvas.width; 
        gl.viewportHeight = canvas.height; 
    } catch (e) {}
    if (!gl) {
        alert("WebGL initialization failed");
    }
}

function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
}

function pushMatrix(stack, m) {
    var copy = mat4.create(m);
    stack.push(copy);
}

function popMatrix(stack) {
    if (stack.length > 0) return stack.pop();
    else console.log("stack has no matrix to pop!");
}

function initObject() {
    
    var request = new XMLHttpRequest();
    request.open("GET", input_JSON);
    request.overrideMimeType("application/json");
    request.onreadystatechange = function () {
        if (request.readyState == 4) {
        processObject(JSON.parse(request.responseText));
        }
    };
    request.send();
}

function processObject(objData) {
    objVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexPositionBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(objData.vertexPositions),
        gl.STATIC_DRAW
    );
    objVertexPositionBuffer.itemSize = 3;
    objVertexPositionBuffer.numItems = objData.vertexPositions.length / 3;

    objVertexNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexNormalBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(objData.vertexNormals),
        gl.STATIC_DRAW
    );
    objVertexNormalBuffer.itemSize = 3;
    objVertexNormalBuffer.numItems = objData.vertexNormals.length / 3;

    objVertexTextureBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexTextureBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(objData.vertexTextureCoords),
        gl.STATIC_DRAW
    );
    objVertexTextureBuffer.itemSize = 2;
    objVertexTextureBuffer.numItems = objData.vertexTextureCoords.length / 2;

    objVertexIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, objVertexIndexBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint32Array(objData.indices),
        gl.STATIC_DRAW
    );
    objVertexIndexBuffer.itemSize = 1;
    objVertexIndexBuffer.numItems = objData.indices.length;

    drawScenePass1();
}

function initSphere(nslices, nstacks, radius) {
    for (var i = 0; i <= nslices; i++) {
      var angle = (i * Math.PI) / nslices;
      var comp1 = Math.sin(angle);
      var comp2 = Math.cos(angle);
  
      for (var j = 0; j <= nstacks; j++) {
        var phi = (j * 2 * Math.PI) / nstacks;
        var comp3 = Math.sin(phi);
        var comp4 = Math.cos(phi);
  
        var xcood = comp4 * comp1;
        var ycoord = comp2;
        var zcoord = comp3 * comp1;
        var utex = 1 - j / nstacks;
        var vtex = 1 - i / nslices;
  
        spVerts.push(radius * xcood, radius * ycoord, radius * zcoord);
        spNormals.push(xcood, ycoord, zcoord);
        spTexCoords.push(utex, vtex);
      }
    }
  
    
    for (var i = 0; i < nslices; i++) {
      for (var j = 0; j < nstacks; j++) {
        var id1 = i * (nstacks + 1) + j;
        var id2 = id1 + nstacks + 1;
  
        spIndicies.push(id1, id2, id1 + 1);
        spIndicies.push(id2, id2 + 1, id1 + 1);
      }
    }
}
  
function initSphereBuffer() {
    var nslices = 50;
    var nstacks = 50;
    var radius = 1.0;
  
    initSphere(nslices, nstacks, radius);
  
    
    spBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spVerts), gl.STATIC_DRAW);
    spBuf.itemSize = 3;
    spBuf.numItems = spVerts.length / 3;
  
    
    spIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint32Array(spIndicies),
      gl.STATIC_DRAW
    );
    spIndexBuf.itemsize = 1;
    spIndexBuf.numItems = spIndicies.length;
  
    
    spNormalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spNormals), gl.STATIC_DRAW);
    spNormalBuf.itemSize = 3;
    spNormalBuf.numItems = spNormals.length / 3;
  
    
    spTexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spTexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spTexCoords), gl.STATIC_DRAW);
    spTexBuf.itemSize = 2;
    spTexBuf.numItems = spTexCoords.length / 2;
}

function initCubeBuffer() {
    var vertices = [

        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
        
        -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
       
        -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
       
        -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
        
        0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
        
        -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5,
    ];
    cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    cubeBuf.itemSize = 3;
    cubeBuf.numItems = vertices.length / 3;
  
    var normals = [
        
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
        
        0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0,
        
        0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,
        
        0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,
        
        1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
        
        -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,
    ];
    cubeNormalBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    cubeNormalBuf.itemSize = 3;
    cubeNormalBuf.numItems = normals.length / 3;
  
    var texCoords = [
        
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
       
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
        
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
       
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
    ];
    cubeTexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeTexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    cubeTexBuf.itemSize = 2;
    cubeTexBuf.numItems = texCoords.length / 2;
  
    var indices = [
        0, 1, 2, 0, 2, 3, 
        4, 5, 6, 4, 6, 7, 
        8, 9, 10, 8, 10, 11, 
        12, 13, 14, 12, 14, 15, 
        16, 17, 18, 16, 18, 19, 
        20, 21, 22, 20, 22, 23, 
    ];
    cubeIndexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuf);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
    );
    cubeIndexBuf.itemSize = 1;
    cubeIndexBuf.numItems = indices.length;
}

function initDepthFBO() {
    
    depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        depthTextureSize,
        depthTextureSize,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    
    FBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
    FBO.width = depthTextureSize;
    FBO.height = depthTextureSize;

    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        depthTexture,
        0
    );

    var FBOstatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (FBOstatus != gl.FRAMEBUFFER_COMPLETE) {
        console.log("GL_FRAMEBUFFER_COMPLETE failed, CANNOT use FBO");
    }
}

function drawObject(color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexPositionBuffer);
    gl.vertexAttribPointer(
        aPositionLocation,
        objVertexPositionBuffer.itemSize,
        gl.FLOAT,
        false,
        0,
        0
    );
        
    gl.bindBuffer(gl.ARRAY_BUFFER, objVertexNormalBuffer);
    gl.vertexAttribPointer(
        aNormalLocation,
        objVertexNormalBuffer.itemSize,
        gl.FLOAT,
        false,
        0,
        0
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, objVertexIndexBuffer);
    
    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);
    gl.uniformMatrix4fv(uLMatrixLocation, false, lMatrix);

    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform3fv(uLightPositionLocation, lightPosition);

    gl.uniform4fv(uLightColorLocation, LightColor);
    gl.uniform4fv(uObjColorLocation, color); 

    gl.drawElements(
        gl.TRIANGLES,
        objVertexIndexBuffer.numItems,
        gl.UNSIGNED_INT,
        0
    );
}

function drawSphere(color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, spBuf);
    gl.vertexAttribPointer(aPositionLocation, spBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, spNormalBuf);
    gl.vertexAttribPointer(aNormalLocation, spNormalBuf.itemSize, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, spIndexBuf);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);
    gl.uniformMatrix4fv(uLMatrixLocation, false, lMatrix);

    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform3fv(uLightPositionLocation, lightPosition);

    gl.uniform4fv(uLightColorLocation, LightColor);
    gl.uniform4fv(uObjColorLocation, color);

    gl.drawElements(gl.TRIANGLES, spIndexBuf.numItems, gl.UNSIGNED_INT, 0);
}

function drawCube(color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.vertexAttribPointer(aPositionLocation, cubeBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cubeNormalBuf);
    gl.vertexAttribPointer(aNormalLocation, cubeNormalBuf.itemSize, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuf);

    gl.uniformMatrix4fv(uMMatrixLocation, false, mMatrix);
    gl.uniformMatrix4fv(uVMatrixLocation, false, vMatrix);
    gl.uniformMatrix4fv(uPMatrixLocation, false, pMatrix);
    gl.uniformMatrix4fv(uLMatrixLocation, false, lMatrix);

    gl.uniform3fv(uEyePosLocation, eyePos);
    gl.uniform3fv(uLightPositionLocation, lightPosition);

    gl.uniform4fv(uLightColorLocation, LightColor);
    gl.uniform4fv(uObjColorLocation, color);

    gl.drawElements(gl.TRIANGLES, cubeIndexBuf.numItems, gl.UNSIGNED_SHORT, 0);
} 

function drawTeapot() {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.scale(mMatrix, [0.05, 0.05, 0.05]);
    color = [0.30, 0.68, 0.53, 1.0];
    drawObject(color);
    mMatrix = popMatrix(matrixStack);
}   

function drawPlank() {
    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [0.0, -0.5, 0.0]);
    mMatrix = mat4.scale(mMatrix, [3.0, 0.01, 3.0]);
    color = [0.3, 0.3, 0.3, 1.0];
    drawCube(color);
    mMatrix = popMatrix(matrixStack);
}

function drawScenePass1() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, FBO);
    gl.viewport(0, 0, depthTextureSize, depthTextureSize);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    shaderProgram = initShaders(vertexShadowShaderCode, fragShadowShaderCode);

    aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation = gl.getAttribLocation(shaderProgram, "aNormal");
    aTexCoordLocation = gl.getAttribLocation(shaderProgram, "aTexCoords");

    uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uPMatrixLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uVMatrixLocation = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uLMatrixLocation = gl.getUniformLocation(shaderProgram, "uLMatrix");

    uEyePosLocation = gl.getUniformLocation(shaderProgram, "eyePos");
    uLightPositionLocation = gl.getUniformLocation(shaderProgram, 'uLightPosition');
    uLightColorLocation = gl.getUniformLocation(shaderProgram, 'uLightColor');
    uObjColorLocation = gl.getUniformLocation(shaderProgram, 'uobjColor');

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);
    gl.enableVertexAttribArray(aTexCoordLocation);

    mat4.identity(mMatrix);

    mat4.identity(vMatrix);
    vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

    mat4.identity(lMatrix);
    lMatrix = mat4.lookAt(lightPosition, COI, viewUp, lMatrix);
    
    mat4.identity(pMatrix);
    mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

    pushMatrix(matrixStack, mMatrix);
    mMatrix = mat4.translate(mMatrix, [-0.18, -0.1, -0.25]);
    drawTeapot();
    mMatrix = popMatrix(matrixStack);
    
    drawPlank();
    mMatrix = mat4.translate(mMatrix, [0.6, -0.25, 0.6]);
    mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
    color = [0.12, 0.39, 0.71, 1.0];
    drawSphere(color);

    drawScenePass2();
}

function drawScenePass2() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    shaderProgram = initShaders(vertexShaderCode, fragShaderCode);
    
    aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
    aNormalLocation = gl.getAttribLocation(shaderProgram, "aNormal");
    aTexCoordLocation = gl.getAttribLocation(shaderProgram, "aTexCoords");

    uMMatrixLocation = gl.getUniformLocation(shaderProgram, "uMMatrix");
    uPMatrixLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
    uVMatrixLocation = gl.getUniformLocation(shaderProgram, "uVMatrix");
    uLMatrixLocation = gl.getUniformLocation(shaderProgram, "uLMatrix");

    uEyePosLocation = gl.getUniformLocation(shaderProgram, "eyePos");
    uLightPositionLocation = gl.getUniformLocation(shaderProgram, 'uLightPosition');
    uLightColorLocation = gl.getUniformLocation(shaderProgram, 'uLightColor');
    uObjColorLocation = gl.getUniformLocation(shaderProgram, 'uobjColor');
    uTexture2DLocation = gl.getUniformLocation(shaderProgram, 'uTexture2D');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1i(uTexture2DLocation, 0);

    gl.enableVertexAttribArray(aPositionLocation);
    gl.enableVertexAttribArray(aNormalLocation);
    gl.enableVertexAttribArray(aTexCoordLocation);

    if (animation) {
        window.cancelAnimationFrame(animation);
    }

    function animate() {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
        mat4.identity(mMatrix);

        mat4.identity(vMatrix);
        vMatrix = mat4.lookAt(eyePos, COI, viewUp, vMatrix);

        lMatrix = mat4.lookAt(lightPosition, COI, viewUp, lMatrix);

        mat4.identity(pMatrix);
        mat4.perspective(50, 1.0, 0.1, 1000, pMatrix);

        eyePos = [-3 * Math.sin(degToRad(degree)), 1.0, 3 * Math.cos(degToRad(degree))];

        if(move)
        {
        degree += 0.3;
        if(degree >= 360.0)
            degree = 0.0;
        }

        pushMatrix(matrixStack, mMatrix);
        mMatrix = mat4.translate(mMatrix, [-0.18, -0.1, -0.25]);
        drawTeapot();
        mMatrix = popMatrix(matrixStack);
        drawPlank();
        mMatrix = mat4.translate(mMatrix, [0.6, -0.25, 0.6]);
        mMatrix = mat4.scale(mMatrix, [0.3, 0.3, 0.3]);
        color = [0.12, 0.39, 0.71, 1.0];
        drawSphere(color);
        animation = window.requestAnimationFrame(animate);
    }
    
    animate();
}

function lightSliderChanged() {
    lightPosition = [2,4,parseFloat(LightSlider.value)];
    drawScenePass1();
  }

function toggleAnimation() {
    move = !move;
}

function webGLStart() {
    canvas = document.getElementById("Shadow");

    LightSlider = document.getElementById("LightSlider");
    LightSlider.addEventListener("input",lightSliderChanged);

    document.getElementById('animationToggle').addEventListener('change', toggleAnimation);

    initGL(canvas);

    initSphereBuffer();
    initCubeBuffer();
    initDepthFBO();

    initObject();
}