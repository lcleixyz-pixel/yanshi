import math, unittest
from optics import fresnel, refract, make_cases, dot, length, sub

class OpticsTests(unittest.TestCase):
    def test_fresnel_known_limits(self):
        # Normal incidence: ((1.5-1)/(1.5+1))^2 = .04 for either polarization.
        for r in fresnel(1,1.5,0):self.assertAlmostEqual(r,.04,places=12)
        self.assertAlmostEqual(fresnel(1,1.5,math.atan(1.5))[1],0,places=12)
        self.assertEqual(fresnel(1.5,1,math.radians(50)),(1.,1.))

    def test_snell_known_angle(self):
        d=refract((.5,0,math.sqrt(3)/2),(0,0,1),1,1.5)
        self.assertAlmostEqual(d[0],1/3,places=12)
        self.assertAlmostEqual(length(d),1,places=12)

    def test_sample_case_and_inaccessible_boundaries(self):
        cases={c['id']:c for c in make_cases()}
        c=cases['isotropic-160'];self.assertAlmostEqual(c['readout']['sampleCriticalAngleDegrees'],58.32756657358341,places=10)
        self.assertEqual([r['kind'] for r in c['readout']['rows']],['partial-reflection','critical','total-internal-reflection'])
        self.assertLess(c['readout']['rows'][0]['reflectedFraction'],.2)
        self.assertEqual(c['readout']['rows'][2]['reflectedFraction'],1.)
        for id in ['air-gap','over-liquid']:
            self.assertIsNone(cases[id]['readout']['sampleRI'])
            self.assertEqual(cases[id]['readout']['status'],'no-sample-reading')
        self.assertTrue(all(r['kind']=='contact-limit' for r in cases['air-gap']['readout']['rows']))

    def test_energy_and_finite_pupils(self):
        for c in make_cases():
            for row in c['readout']['rows']:
                self.assertGreaterEqual(row['reflectedFraction'],0)
                self.assertLessEqual(row['reflectedFraction'],1)
                self.assertAlmostEqual(row['reflectedFraction']+row['transmittedFraction'],1,places=12)
            for ray in c['verification']:
                for h in ray['apertures'].values():self.assertTrue(h['withinAperture'])

if __name__=='__main__':unittest.main()
