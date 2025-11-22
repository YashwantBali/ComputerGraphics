var gl;
var canvas;

var sqBuf;
var aPositionLocation;
var uLightPosLocation;
var uChoiceLocation;
var LightSlider;

var lightPos = [-5.0,3.0,5.0];
var choice = 4;

const vertexShaderCode = `#version 300 es
in vec3 aPosition;

void main() {
    gl_Position =  vec4(aPosition,1.0);
}`;

const fragShaderCode = `#version 300 es
precision mediump float;

uniform vec3 uLightPosition;
uniform int choice;

out vec4 fragColor;

struct Sphere {
vec3 center;
float radius;
vec3 color;
float shininess;
};

struct Ray {
vec3 origin;
vec3 direction;
};

vec3 cameraPos = vec3(0.0, 0.0, 1.0);

// Function to calculate the intersection of a ray with a sphere
float intersectSphere(vec3 rayOrg, vec3 rayDir, Sphere sphere) {
    vec3 v = rayOrg - sphere.center;
    float a = dot(rayDir, rayDir);
    float b = 2.0 * dot(v, rayDir);
    float c = dot(v, v) - sphere.radius * sphere.radius;
    float D = b * b - 4.0 * a * c;

    if (D < 0.0) {
        return 0.0; // No intersection
    } else {
        float pt1 = (-b - sqrt(D)) / (2.0 * a);
        float pt2 = (-b + sqrt(D)) / (2.0 * a);
        return min(pt1, pt2);
    }
}

// Phong shading
vec3 phongShading(vec3 normal, vec3 intPt, vec3 diffuseTerm, float AlphaSpecular) {
  vec3 L = normalize(uLightPosition - intPt);
  vec3 n = normalize(normal);
  vec3 v = normalize(cameraPos - intPt);
  vec3 r = normalize(reflect(-L,n));

  float uIntensity = 1.0;
  float diffuse = uIntensity*max(dot(L,n),0.0);
  float specular = uIntensity*pow(max(dot(v,r),0.0),AlphaSpecular);
  float ambient = uIntensity*0.3;

  vec3 finalColor = diffuse*(diffuseTerm)+ ambient*(diffuseTerm)+ specular*(vec3(1,1,1));

  return finalColor;
}

// Phong shading without specular
vec3 phongShadingNoSpec(vec3 normal, vec3 intPt, vec3 diffuseTerm) {
  vec3 L = normalize(uLightPosition - intPt);
  vec3 n = normalize(normal);
  vec3 v = normalize(cameraPos - intPt);
  vec3 r = normalize(reflect(-L,n));

  float uIntensity = 1.0;
  float diffuse = uIntensity*max(dot(L,n),0.0);
  float ambient = uIntensity*0.3;

  vec3 finalColor = diffuse*(diffuseTerm)+ ambient*(diffuseTerm);

  return finalColor;
}

void main() {
    Sphere spheres[7];
    spheres[0] = Sphere(vec3(0.15, -0.3, 0.0), 0.2, vec3(0.0, 0.55, 0.32), 12.0);
    spheres[1] = Sphere(vec3(-0.2, -0.35,0.1), 0.2,vec3(0.0, 0.78, 0.0), 10.0);
    spheres[2] = Sphere(vec3(0.3,  0.04, 0.0), 0.2, vec3(0.0, 0.6, 0.6), 20.0);
    spheres[3] = Sphere(vec3(0.15, 0.38, -0.2), 0.22, vec3(0.0, 0.44, 0.73), 15.0);
    spheres[4] = Sphere(vec3(-0.25, 0.7, -0.7), 0.28, vec3(0.0, 0.255, 0.77), 25.0);
    spheres[5] = Sphere(vec3(-0.65, 0.45, -0.9), 0.28, vec3(0.3, 0.15, 0.6), 17.0);
    spheres[6] = Sphere(vec3(-0.45, 0.08, -1.5), 0.4, vec3(0.46, 0.13, 0.46), 14.0);

    Ray ray;
    // create the ray for current frag
    ray.origin = cameraPos;

    // direction is through each screen fragment in negative z direction
    vec2 screenPos = gl_FragCoord.xy/vec2(600.0, 600.0);
    ray.direction = normalize(vec3(screenPos * 2.0 - 1.0, -1.0));

    float leastT = 1e8; 
    int closestSph = -1;

    for (int i = 0; i < 7; i++) {
        float t = intersectSphere(ray.origin, ray.direction, spheres[i]);
        if (t > 0.0  && t < leastT) {
            // The intersection is closer
            leastT = t;
            closestSph = i;
        }
    }

    if(closestSph == -1)
        fragColor = vec4(0.0,0.0,0.0,1.0);  
    else
    {
        // Calculate intersection point
        vec3 intersectionPoint = ray.origin + leastT * ray.direction;

        // Calculate normal at the intersection point
        vec3 normal = normalize(intersectionPoint - spheres[closestSph].center);

        vec3 phongColor = phongShading(normal, intersectionPoint, spheres[closestSph].color, spheres[closestSph].shininess);

        vec3 phongColorNoSpec = phongShadingNoSpec(normal, intersectionPoint, spheres[closestSph].color);

        bool shadow = false;

        for (int i = 0; i < 7; i++) {
            if (i == closestSph) 
                continue;
            float t = intersectSphere(intersectionPoint, normalize(uLightPosition - intersectionPoint), spheres[i]);
            if (t > 0.0) {
                shadow = true; // Point is in shadow
                break;
            }
        }

        Ray reflRay;
        reflRay.origin = intersectionPoint + 0.001*normal;
        reflRay.direction = normalize(reflect(ray.direction, normal));

        //Calculate intersection for the reflected ray
        leastT = 1e8; 
        closestSph = -1;

        for (int i = 0; i < 7; i++) {
            float t = intersectSphere(reflRay.origin, reflRay.direction, spheres[i]);
            if (t > 0.0  && t < leastT) {
                leastT = t;
                closestSph = i;
            }
        }        

        vec3 reflColor = vec3(0.0,0.0,0.0);
        vec3 reflColorNoSpec = vec3(0.0,0.0,0.0);
        if(closestSph != -1)
        {
            intersectionPoint = reflRay.origin + leastT * reflRay.direction;
            normal = normalize(intersectionPoint - spheres[closestSph].center);
            reflColor = phongShading(normal, intersectionPoint, spheres[closestSph].color, spheres[closestSph].shininess);
            reflColorNoSpec = phongShadingNoSpec(normal, intersectionPoint, spheres[closestSph].color);
        }

        if(choice == 1 || (choice == 3 && shadow == false))
            fragColor = vec4(phongColor, 1.0);
        else if(choice == 2 || (choice == 4 && shadow == false))
            fragColor = vec4(phongColor + 0.5*reflColor,1.0);
        else if(choice == 3 && shadow == true)
            fragColor = vec4(0.4*phongColorNoSpec,1.0);
        else
            fragColor = vec4(0.4*(phongColorNoSpec + 0.5*reflColorNoSpec),1.0);
    }
}`;

function vertexShaderSetup(vertexShaderCode) {
    shader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(shader, vertexShaderCode);
    gl.compileShader(shader);
    // Error check whether the shader is compiled correctly
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

function initSquareBuffer() {
    sqBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sqBuf);
    const bufData = new Float32Array([
        -1, 1, 0, 1, 1, 0, -1, -1, 0, -1, -1, 0, 1, 1, 0, 1, -1, 0,]);
        
    gl.bufferData(gl.ARRAY_BUFFER, bufData, gl.STATIC_DRAW);
}

function drawScene() {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, sqBuf);
    gl.vertexAttribPointer(aPositionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(uLightPosLocation, lightPos);
    gl.uniform1i(uChoiceLocation, choice);
    gl.drawArrays(gl.TRIANGLES, 0, 6); 
}

function setChoice(ch) {
    choice = ch;
    drawScene();
}

function lightSliderChanged() {
    lightPos = [parseFloat(LightSlider.value),3.0,5.0];
    drawScene();
  }

function webGLStart() {
    canvas = document.getElementById("RayTracing");
    initGL(canvas);
    shaderProgram = initShaders(vertexShaderCode,fragShaderCode);

    aPositionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
    uLightPosLocation = gl.getUniformLocation(shaderProgram, "uLightPosition");
    uChoiceLocation = gl.getUniformLocation(shaderProgram, "choice");

    gl.enableVertexAttribArray(aPositionLocation);

    LightSlider = document.getElementById("LightSlider");
    LightSlider.addEventListener("input",lightSliderChanged);

    initSquareBuffer();
    drawScene();
}