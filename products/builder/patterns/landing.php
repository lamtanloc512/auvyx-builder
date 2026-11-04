<?php
/**
 * Landing page starter: hero + responsive feature grid + CTA.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Blocks\Markup as M;

defined( 'ABSPATH' ) || exit;

$auvyx_builder_color = static function ( string $slug ): string {
	return 'var(--wp--preset--color--' . $slug . ')';
};

$auvyx_builder_card = static function ( string $title, string $body ) use ( $auvyx_builder_color ): string {
	return M::section(
		array(
			M::heading(
				$title,
				3,
				M::styles(
					array(
						'font-size'          => 'var(--wp--preset--font-size--auvyx-lg)',
						'margin-block-start' => '0',
						'margin-block-end'   => '0.5rem',
						'color'              => $auvyx_builder_color( 'auvyx-text' ),
					)
				)
			),
			M::text(
				$body,
				M::styles(
					array(
						'margin-block-start' => '0',
						'margin-block-end'   => '0',
						'color'              => '#475569',
						'line-height'        => '1.6',
					)
				)
			),
		),
		M::styles(
			array(
				'padding-block-start'  => '2rem',
				'padding-block-end'    => '2rem',
				'padding-inline-start' => '2rem',
				'padding-inline-end'   => '2rem',
				'background-color'     => '#ffffff',
				'border-width'         => '1px',
				'border-style'         => 'solid',
				'border-color'         => '#e2e8f0',
				'border-radius'        => '1rem',
				'transition'           => 'transform .2s ease, box-shadow .2s ease',
			),
			array(),
			array(
				'padding-block-start'  => '1.5rem',
				'padding-block-end'    => '1.5rem',
				'padding-inline-start' => '1.5rem',
				'padding-inline-end'   => '1.5rem',
			),
			array(
				'transform'  => 'translateY(-4px)',
				'box-shadow' => '0 12px 32px rgba(15, 23, 42, 0.12)',
			)
		),
		array( 'tagName' => 'article' )
	);
};

$auvyx_builder_hero = M::section(
	array(
		M::text(
			__( 'Block-native visual builder', 'auvyx-builder' ),
			M::styles(
				array(
					'margin-block-start' => '0',
					'margin-block-end'   => '0',
					'color'              => $auvyx_builder_color( 'auvyx-accent' ),
					'font-weight'        => '600',
					'text-transform'     => 'uppercase',
					'letter-spacing'     => '0.12em',
					'font-size'          => 'var(--wp--preset--font-size--auvyx-sm)',
				)
			)
		),
		M::heading(
			__( 'Design faster. Own your content.', 'auvyx-builder' ),
			1,
			M::styles(
				array(
					'font-size'          => 'var(--wp--preset--font-size--auvyx-xxl)',
					'line-height'        => '1.05',
					'max-width'          => '18ch',
					'margin-block-start' => '0',
					'margin-block-end'   => '0',
					'color'              => $auvyx_builder_color( 'auvyx-inverse' ),
				),
				array(),
				array( 'line-height' => '1.1' )
			)
		),
		M::text(
			__( 'Responsive styles, design tokens and native blocks. Deactivate the plugin and your content is still there.', 'auvyx-builder' ),
			M::styles(
				array(
					'max-width'          => '60ch',
					'margin-block-start' => '0',
					'margin-block-end'   => '0',
					'font-size'          => 'var(--wp--preset--font-size--auvyx-md)',
					'opacity'            => '0.8',
					'color'              => $auvyx_builder_color( 'auvyx-inverse' ),
				)
			)
		),
		M::section(
			array(
				M::button( __( 'Get started', 'auvyx-builder' ), '#features' ),
				M::button(
					__( 'View docs', 'auvyx-builder' ),
					'#',
					M::styles(
						array(
							'background-color' => 'transparent',
							'border-width'     => '1px',
							'border-style'     => 'solid',
							'border-color'     => 'rgba(255, 255, 255, 0.35)',
						),
						array(),
						array(),
						array(
							'background-color' => $auvyx_builder_color( 'auvyx-inverse' ),
							'color'            => $auvyx_builder_color( 'auvyx-secondary' ),
						)
					)
				),
			),
			M::styles(
				array(
					'display'            => 'flex',
					'flex-wrap'          => 'wrap',
					'justify-content'    => 'center',
					'gap'                => '1rem',
					'margin-block-start' => '1rem',
				),
				array(),
				array(
					'flex-direction' => 'column',
					'width'          => '100%',
				)
			),
			array( 'tagName' => 'div' )
		),
	),
	M::styles(
		array(
			'display'              => 'flex',
			'flex-direction'       => 'column',
			'align-items'          => 'center',
			'gap'                  => '1.5rem',
			'margin-block-start'   => '0',
			'padding-block-start'  => '7rem',
			'padding-block-end'    => '7rem',
			'padding-inline-start' => '1.5rem',
			'padding-inline-end'   => '1.5rem',
			'background-color'     => $auvyx_builder_color( 'auvyx-secondary' ),
			'background-image'     => 'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.45), transparent 60%)',
			'text-align'           => 'center',
		),
		array(
			'padding-block-start' => '5rem',
			'padding-block-end'   => '5rem',
		),
		array(
			'padding-block-start' => '3.5rem',
			'padding-block-end'   => '3.5rem',
			'gap'                 => '1rem',
		)
	),
	array( 'align' => 'full' )
);

$auvyx_builder_features = M::section(
	array(
		M::heading(
			__( 'Everything a modern site needs', 'auvyx-builder' ),
			2,
			M::styles(
				array(
					'text-align'         => 'center',
					'font-size'          => 'var(--wp--preset--font-size--auvyx-xl)',
					'margin-block-start' => '0',
					'margin-block-end'   => '2.5rem',
					'color'              => $auvyx_builder_color( 'auvyx-text' ),
				)
			)
		),
		M::section(
			array(
				$auvyx_builder_card( __( 'Responsive by default', 'auvyx-builder' ), __( 'Set styles per breakpoint. Tablet and mobile inherit from desktop until you override them.', 'auvyx-builder' ) ),
				$auvyx_builder_card( __( 'Design tokens', 'auvyx-builder' ), __( 'Colors, spacing and type live in theme.json, so core blocks and other plugins share them.', 'auvyx-builder' ) ),
				$auvyx_builder_card( __( 'No lock-in', 'auvyx-builder' ), __( 'Everything is saved as native WordPress blocks. Your content survives a plugin switch.', 'auvyx-builder' ) ),
				$auvyx_builder_card( __( 'Fast frontend', 'auvyx-builder' ), __( 'Only the CSS your page uses is printed, deduplicated. Zero JavaScript for static layouts.', 'auvyx-builder' ) ),
				$auvyx_builder_card( __( 'Hover & focus states', 'auvyx-builder' ), __( 'Style interactions per breakpoint without writing CSS.', 'auvyx-builder' ) ),
				$auvyx_builder_card( __( 'AI-ready', 'auvyx-builder' ), __( 'A structured style model that agents can read and edit safely.', 'auvyx-builder' ) ),
			),
			M::styles(
				array(
					'display'               => 'grid',
					'grid-template-columns' => 'repeat(3, 1fr)',
					'gap'                   => '1.5rem',
				),
				array( 'grid-template-columns' => 'repeat(2, 1fr)' ),
				array(
					'grid-template-columns' => '1fr',
					'gap'                   => '1rem',
				)
			),
			array( 'tagName' => 'div' )
		),
	),
	M::styles(
		array(
			'margin-block-start'   => '0',
			'padding-block-start'  => '6rem',
			'padding-block-end'    => '6rem',
			'padding-inline-start' => 'var(--auvyx-band, max(1.5rem, calc((100% - 1200px) / 2)))',
			'padding-inline-end'   => 'var(--auvyx-band, max(1.5rem, calc((100% - 1200px) / 2)))',
			'background-color'     => $auvyx_builder_color( 'auvyx-surface' ),
		),
		array(),
		array(
			'padding-block-start' => '3.5rem',
			'padding-block-end'   => '3.5rem',
		)
	),
	array( 'align' => 'full' )
);

return array(
	'title'       => __( 'Auvyx Landing (hero + features)', 'auvyx-builder' ),
	'description' => __( 'Responsive hero and feature grid built with Auvyx blocks.', 'auvyx-builder' ),
	'content'     => $auvyx_builder_hero . $auvyx_builder_features,
);
