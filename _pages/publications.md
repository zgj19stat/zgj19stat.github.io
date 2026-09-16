---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
research_map: true
---

My research spans three complementary areas: **Statistical Machine Learning**, **Network and Graphical Models**, and **Agent Research**. The map below connects individual works by research theme and can also arrange them chronologically; select a node to jump to its entry.

{% include scholar-map.html %}

<p class="publication-author-note">(<sup aria-label="Corresponding author">&#42;</sup> Corresponding Author; <sup aria-label="Co-first author">&#35;</sup> Co-first Author; <sup aria-label="Authors listed in alphabetical order">&dagger;</sup> Authors listed in alphabetical order)</p>

{% assign publication_data = site.data.publications %}
{% assign stages = "manuscript,publication" | split: "," %}

{% for area in publication_data.areas %}
  <section class="publication-area" aria-labelledby="{{ area.id }}">
    <h2 id="{{ area.id }}">{{ area.title }}</h2>
    <p class="publication-area__description">{{ area.description }}</p>

    {% assign area_works = publication_data.works | where: "area", area.id %}

    {% for stage in stages %}
      {% assign stage_works = area_works | where: "stage", stage %}
      {% if stage_works.size > 0 %}
        {% if stage == "manuscript" %}
          {% assign stage_heading = "Manuscripts" %}
        {% else %}
          {% assign stage_heading = "Publications" %}
        {% endif %}

        <h3>{{ stage_heading }}</h3>
        <ul class="publication-list">
          {% for work in stage_works %}
            <li id="{{ work.id }}" class="publication-item" data-stage="{{ work.stage }}" tabindex="-1">
              <span class="publication-item__title">{{ work.title }}</span><br>
              <span class="publication-item__authors">{{ work.authors_html }}</span><br>
              <span class="publication-item__details">{{ work.details_html }}</span>{% for link in work.links %} [<a href="{{ link.url }}">{{ link.label }}</a>]{% endfor %}
            </li>
          {% endfor %}
        </ul>
      {% endif %}
    {% endfor %}
  </section>
{% endfor %}
